#!/usr/bin/env python3
"""Aggregate token usage from Codex or Claude Code jsonl logs.

Reads usage metadata only; never emits conversation content.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

FIELDS = ('input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
          'output_tokens', 'reasoning_output_tokens', 'total_tokens')


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('timestamps must include timezone')
    return result


CLAUDE_RAW = ('input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'output_tokens')


def entry_format(entry):
    fmt = entry.get('format')
    if fmt is None:
        fmt = 'claude' if 'session_id' in entry else 'codex' if 'thread_id' in entry else None
    if fmt not in ('claude', 'codex'):
        raise ValueError('session format must be claude or codex')
    return fmt


def claude_log_path(entry, base):
    """Explicit log_path, else ~/.claude/projects/*/<session_id>.jsonl (one match required)."""
    if entry.get('log_path'):
        path = Path(entry['log_path']).expanduser()
        return path if path.is_absolute() else base / path
    root = Path(entry.get('projects_dir') or '~/.claude/projects').expanduser()
    matches = sorted(root.glob(f"*/{entry['session_id']}.jsonl"))
    if len(matches) != 1:
        raise ValueError('log_path needed: session file not found uniquely')
    return matches[0]


def claude_usage(usage):
    """Normalize Claude usage. Claude input_tokens excludes cache reads/writes, so add them back.

    Returns (usage, flags); flags marks reasoning that could not be verified:
    'no_details' (output_tokens_details/thinking_tokens absent) or 'thinking_unverified' (invalid/too large).
    """
    if not isinstance(usage, dict):
        return None, {}
    raw = {k: usage.get(k, 0 if k.startswith('cache_') else None) for k in CLAUDE_RAW}
    if any(type(v) is not int or v < 0 for v in raw.values()):
        return None, {}
    details = usage.get('output_tokens_details')
    no_details = not isinstance(details, dict) or 'thinking_tokens' not in details
    thinking = 0 if no_details else details['thinking_tokens']
    thinking_ok = type(thinking) is int and 0 <= thinking <= raw['output_tokens']
    total_input = raw['input_tokens'] + raw['cache_read_input_tokens'] + raw['cache_creation_input_tokens']
    return {'input_tokens': total_input,
            'cached_input_tokens': raw['cache_read_input_tokens'],
            'cache_write_input_tokens': raw['cache_creation_input_tokens'],
            'output_tokens': raw['output_tokens'],
            'reasoning_output_tokens': thinking if thinking_ok else 0,
            'total_tokens': total_input + raw['output_tokens']}, {
                'no_details': no_details, 'thinking_unverified': not thinking_ok}


def claude_file(path, label, owner, uuid_range, start, cutoff, claude_seen, issues, stats):
    """Read one Claude Code jsonl file; keep only assistant usage metadata."""
    first, last = uuid_range
    active = first is None
    hit_first = hit_last = False
    try:
        with path.open() as stream:
            for number, line in enumerate(stream, 1):
                try:
                    obj = json.loads(line)
                except (ValueError, TypeError):
                    issues.append(f'{label}: invalid JSON at line {number}')
                    continue
                if not isinstance(obj, dict):
                    issues.append(f'{label}: invalid record shape at line {number}')
                    continue
                if not active and obj.get('uuid') == first:
                    active = hit_first = True
                if not active:
                    continue
                if last is not None and obj.get('uuid') == last:
                    hit_last = True
                    active = False
                if obj.get('type') != 'assistant':
                    continue
                if obj.get('sessionId') != owner:
                    stats['foreign_skipped'] += 1
                    continue
                message = obj.get('message')
                if not isinstance(message, dict):
                    issues.append(f'{label}: invalid assistant message at line {number}')
                    continue
                if message.get('model') == '<synthetic>':
                    stats['synthetic_skipped'] += 1
                    continue
                try:
                    stamp = instant(obj['timestamp'])
                except (KeyError, ValueError, TypeError, AttributeError):
                    issues.append(f'{label}: usage timestamp missing/invalid')
                    continue
                if not start <= stamp <= cutoff:
                    continue
                key = message.get('id') or obj.get('requestId')
                usage, flags = claude_usage(message.get('usage'))
                if not isinstance(key, str) or not key or usage is None:
                    issues.append(f'{label}: invalid response identity/usage')
                    continue
                if key in claude_seen:
                    stats['duplicates_skipped'] += 1
                    if claude_seen[key][1] != usage:
                        stats['duplicates_updated'] += 1
                    # Same response repeated per content block: the last record wins (flags too).
                    claude_seen[key] = (claude_seen[key][0], usage, flags)
                    continue
                claude_seen[key] = ((owner, label), usage, flags)
    except OSError:
        issues.append(f'{label}: log unavailable')
    if first is not None and not hit_first:
        issues.append(f'{label}: from_uuid not found')
    if last is not None and not hit_last:
        issues.append(f'{label}: to_uuid not found')


def claude_session(entry, base, start, cutoff, claude_seen, issues, notes):
    """Claude Code session: main <session_id>.jsonl plus optional <session_id>/subagents/agent-*.jsonl."""
    session = entry['session_id']
    if not isinstance(session, str) or not session:
        raise ValueError('session_id must be a nonempty string')
    include = entry.get('include_subagents', True)
    if type(include) is not bool:
        raise ValueError(f'{session}: include_subagents must be true or false')
    agent_ids = entry.get('agent_ids')
    if agent_ids is not None and (not isinstance(agent_ids, list)
                                  or not all(isinstance(a, str) and a for a in agent_ids)):
        raise ValueError(f'{session}: agent_ids must be null or a list of nonempty strings')
    path = claude_log_path(entry, base)
    stats = dict.fromkeys(('duplicates_skipped', 'duplicates_updated', 'synthetic_skipped',
                           'foreign_skipped'), 0)
    claude_file(path, session, session, (entry.get('from_uuid'), entry.get('to_uuid')),
                start, cutoff, claude_seen, issues, stats)
    files = []
    if include:
        folder = path.with_suffix('') / 'subagents'
        files = sorted(folder.glob('agent-*.jsonl'))
        if agent_ids is not None:
            wanted = {f'agent-{a}' for a in agent_ids}
            missing = sorted(wanted - {f.stem for f in files})
            if missing:
                issues.append(f'{session}: subagent logs missing: {", ".join(m[6:] for m in missing)}')
            files = [f for f in files if f.stem in wanted]
        for sub in files:
            claude_file(sub, f'{session}/{sub.stem}', session, (None, None),
                        start, cutoff, claude_seen, issues, stats)
    return {'format': 'claude', 'session_id': session, 'include_subagents': include,
            'subagent_files': len(files), 'from_uuid': entry.get('from_uuid'), 'to_uuid': entry.get('to_uuid'),
            **stats}


def finish_claude(sessions, claude_seen, totals, issues, notes):
    """Sum deduplicated Claude responses once, attributed to the first owning file.

    Reasoning flags are counted per unique response (after deduplication), not per log line.
    """
    by_session = {}
    for (owner, label), usage, flags in claude_seen.values():
        bucket = by_session.setdefault(owner, {'main': dict.fromkeys(FIELDS, 0),
                                               'subagents': dict.fromkeys(FIELDS, 0),
                                               'main_responses': 0, 'subagents_responses': 0,
                                               'thinking_unverified': 0, 'no_details': 0})
        part = 'main' if label == owner else 'subagents'
        bucket[part + '_responses'] += 1
        if flags.get('no_details'):
            bucket['no_details'] += 1
        elif flags.get('thinking_unverified'):
            bucket['thinking_unverified'] += 1
        for key in FIELDS:
            totals[key] += usage[key]
            bucket[part][key] += usage[key]
    for item in sessions:
        if item['format'] != 'claude':
            continue
        bucket = by_session.get(item['session_id'])
        if bucket is None:
            item.update(unique_responses=0, usage=dict.fromkeys(FIELDS, 0))
            issues.append(f"{item['session_id']}: no recorded usage in range")
            continue
        usage = {k: bucket['main'][k] + bucket['subagents'][k] for k in FIELDS}
        session = item['session_id']
        if bucket['thinking_unverified']:
            notes.append(f'{session}: {bucket["thinking_unverified"]} responses had invalid thinking_tokens '
                         '(> output_tokens or not an integer); reasoning counted as 0 for them')
        if bucket['no_details']:
            notes.append(f'{session}: {bucket["no_details"]} responses had no output_tokens_details.thinking_tokens; '
                         'reasoning not recorded (counted as 0, not a measured zero)')
        item.update(thinking_unverified=bucket['thinking_unverified'], reasoning_unrecorded=bucket['no_details'])
        item.update(unique_responses=bucket['main_responses'] + bucket['subagents_responses'],
                    subagent_responses=bucket['subagents_responses'],
                    usage=usage, main_usage=bucket['main'], subagent_usage=bucket['subagents'])
        by_session.pop(item['session_id'])


def codex_session(entry, base, start, cutoff, seen, totals, issues):
    """Codex rollout: token_usage_record per response, scoped by thread and turn IDs."""
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
    return {'format': 'codex', 'thread_id': thread, 'turn_ids': sorted(turns),
            'recorded_turn_ids': sorted(found), 'completed_turn_ids': sorted(completed),
            'unique_responses': count, 'duplicates_skipped': duplicates, 'usage': subtotal}


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
    claude_seen = {}
    notes = []
    owners = set()
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError('each session entry must be an object')
        fmt = entry_format(entry)
        if fmt == 'claude':
            if entry.get('session_id') in owners:
                raise ValueError(f"duplicate session_id in manifest: {entry.get('session_id')} "
                                 '(list each session once; narrow with from_uuid/to_uuid or agent_ids)')
            owners.add(entry.get('session_id'))
            sessions.append(claude_session(entry, base, start, cutoff, claude_seen, issues, notes))
        else:
            sessions.append(codex_session(entry, base, start, cutoff, seen, totals, issues))
    finish_claude(sessions, claude_seen, totals, issues, notes)
    return {'task_id': manifest['task_id'], 'status': 'partial' if issues else 'recorded_snapshot',
            'started_at': start.isoformat(), 'cutoff_at': cutoff.isoformat(),
            'collected_at': now.isoformat(), 'ended_at': manifest.get('ended_at'),
            'wall_clock_seconds': (cutoff - start).total_seconds(),
            'usage': totals, 'sessions': sessions, 'issues': sorted(set(issues)), 'notes': notes,
            'limitations': ['Recorded usage through cutoff; in-flight/final reporting responses may be absent.',
                            'Cached input and reasoning output are subsets, not additional tokens.',
                            'Wall-clock elapsed time includes waiting; parallel session durations are not summed.',
                            'Not a billing statement; external tool/API usage is excluded.',
                            'Claude Code: input_tokens = input + cache_read + cache_creation; one count per message.id.']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('manifest', type=Path)
    args = parser.parse_args()
    try:
        result = report(json.loads(args.manifest.read_text()), args.manifest.parent)
    except (KeyError, ValueError, TypeError, OSError) as exc:
        detail = exc.args[0] if isinstance(exc, KeyError) and exc.args else exc
        message = f'missing key {detail!r}' if isinstance(exc, KeyError) else str(detail)
        parser.exit(2, f'Invalid manifest: {type(exc).__name__}: {message}\n')
    try:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.stdout.flush()
    except BrokenPipeError:
        # Reader (e.g. head) closed early: silence the flush-at-exit error too.
        os.dup2(os.open(os.devnull, os.O_WRONLY), sys.stdout.fileno())
        sys.exit(0)


if __name__ == '__main__':
    main()
