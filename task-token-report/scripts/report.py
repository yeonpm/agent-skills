#!/usr/bin/env python3
"""Read usage metadata only; never emit conversation content."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

FIELDS = ('input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
          'output_tokens', 'reasoning_output_tokens', 'total_tokens')


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timestamps must include timezone')
    return result


def report(manifest, base=Path('.'), now=None):
    now = now or datetime.now(timezone.utc)
    start = instant(manifest['started_at'])
    end = instant(manifest.get('ended_at') or now.isoformat())
    cutoff = min(end, now)
    if cutoff < start:
        raise ValueError('end/cutoff precedes start')
    issues = []
    seen = {}
    totals = dict.fromkeys(FIELDS, 0)
    sessions = []
    entries = manifest['sessions']
    if not entries:
        raise ValueError('sessions cannot be empty')
    if not manifest.get('scope_complete', False):
        issues.append('session inventory not confirmed complete')
    for entry in entries:
        thread = entry['thread_id']
        turns = set(entry['turn_ids'])
        if not turns or not all(isinstance(t, str) and t for t in turns):
            raise ValueError('each session needs explicit nonempty turn_ids')
        path = Path(entry['log_path']).expanduser()
        if not path.is_absolute():
            path = base / path
        found = set()
        completed = set()
        duplicates = 0
        count = 0
        subtotal = dict.fromkeys(FIELDS, 0)
        try:
            with path.open() as stream:
                for number, line in enumerate(stream, 1):
                    try:
                        obj = json.loads(line)
                    except (ValueError, TypeError):
                        issues.append(f'{thread}: invalid JSON at line {number}')
                        continue
                    if not isinstance(obj, dict) or not isinstance(obj.get('payload'), dict):
                        issues.append(f'{thread}: invalid record shape at line {number}')
                        continue
                    payload = obj['payload']
                    if obj.get('type') == 'event_msg' and payload.get('type') == 'task_complete':
                        try:
                            completion_time = instant(obj['timestamp'])
                            if payload.get('turn_id') in turns and start <= completion_time <= cutoff:
                                completed.add(payload['turn_id'])
                        except (KeyError, ValueError, TypeError, AttributeError):
                            issues.append(f'{thread}: completion timestamp missing/invalid')
                    if obj.get('type') != 'token_usage_record':
                        continue
                    if payload.get('turn_id') not in turns:
                        continue
                    # Copied parent/fork records must belong to their explicit owner.
                    if payload.get('thread_id') != thread:
                        continue
                    try:
                        stamp = instant(obj['timestamp'])
                    except (KeyError, ValueError, TypeError, AttributeError):
                        issues.append(f'{thread}: usage timestamp missing/invalid')
                        continue
                    if not start <= stamp <= cutoff:
                        continue
                    response = payload.get('response_id')
                    usage = payload.get('usage', {})
                    if not isinstance(response, str) or not response or not isinstance(usage, dict) or any(type(usage.get(k)) is not int or usage[k] < 0 for k in FIELDS):
                        issues.append(f'{thread}: invalid response identity/usage')
                        continue
                    if (usage['input_tokens'] + usage['output_tokens'] != usage['total_tokens']
                            or usage['cached_input_tokens'] > usage['input_tokens']
                            or usage['reasoning_output_tokens'] > usage['output_tokens']):
                        issues.append(f'{thread}: inconsistent token subsets/total')
                        continue
                    found.add(payload['turn_id'])
                    if response in seen:
                        duplicates += 1
                        if seen[response] != usage:
                            issues.append(f'{thread}: conflicting duplicate response usage')
                        continue
                    seen[response] = usage
                    count += 1
                    for key in FIELDS:
                        totals[key] += usage[key]
                        subtotal[key] += usage[key]
        except OSError:
            issues.append(f'{thread}: log unavailable')
        missing = sorted(turns - found)
        if missing:
            issues.append(f'{thread}: selected turns without recorded usage: {", ".join(missing)}')
        sessions.append({'thread_id': thread, 'turn_ids': sorted(turns),
                         'recorded_turn_ids': sorted(found), 'completed_turn_ids': sorted(completed),
                         'unique_responses': count, 'duplicates_skipped': duplicates, 'usage': subtotal})
    return {'task_id': manifest['task_id'], 'status': 'partial' if issues else 'recorded_snapshot',
            'started_at': start.isoformat(), 'cutoff_at': cutoff.isoformat(),
            'collected_at': now.isoformat(), 'ended_at': manifest.get('ended_at'),
            'wall_clock_seconds': (cutoff - start).total_seconds(),
            'usage': totals, 'sessions': sessions, 'issues': sorted(set(issues)),
            'limitations': ['Recorded usage through cutoff; in-flight/final reporting responses may be absent.',
                            'Cached input and reasoning output are subsets, not additional tokens.',
                            'Wall-clock elapsed time includes waiting; parallel session durations are not summed.',
                            'Not a billing statement; external tool/API usage is excluded.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    try:
        result = report(json.loads(args.manifest.read_text()), args.manifest.parent)
    except (KeyError, ValueError, TypeError, OSError) as exc:
        parser.exit(2, f'Invalid manifest: {type(exc).__name__}\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
