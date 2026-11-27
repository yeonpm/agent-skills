import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

spec = importlib.util.spec_from_file_location('report', Path(__file__).parents[1] / 'scripts/report.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def event(thread='parent', turn='turn', response='r1', amount=100):
    return {'timestamp': '2026-10-07T01:01:00Z', 'type': 'token_usage_record',
            'payload': {'thread_id': thread, 'turn_id': turn, 'response_id': response,
                        'usage': dict(input_tokens=amount, cached_input_tokens=80,
                                      cache_write_input_tokens=0, output_tokens=10,
                                      reasoning_output_tokens=4, total_tokens=amount + 10)}}


class UsageTests(unittest.TestCase):
    def run_report(self, logs, entries=None, **changes):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            for name, records in logs.items():
                (base / name).write_text('\n'.join(json.dumps(r) for r in records))
            manifest = dict(task_id='test', started_at='2026-10-07T01:00:00Z',
                            ended_at='2026-10-07T01:02:00Z', scope_complete=True,
                            sessions=entries or [dict(thread_id='parent', turn_ids=['turn'], log_path='p')])
            manifest.update(changes)
            return module.report(manifest, base, datetime(2026, 10, 7, 1, 3, tzinfo=timezone.utc))

    def test_duplicate_and_subsets(self):
        result = self.run_report({'p': [event(), event()]})
        self.assertEqual(result['usage']['total_tokens'], 110)
        self.assertEqual(result['usage']['cached_input_tokens'], 80)
        self.assertEqual(result['sessions'][0]['duplicates_skipped'], 1)

    def test_scope_and_time(self):
        late = event(response='late'); late['timestamp'] = '2026-10-07T01:03:00Z'
        result = self.run_report({'p': [event(), event(turn='other'), event(thread='other'), late]})
        self.assertEqual(result['usage']['total_tokens'], 110)

    def test_missing_not_zero_claim(self):
        result = self.run_report({})
        self.assertEqual(result['status'], 'partial')
        self.assertTrue(result['issues'])

    def test_parallel_parent_copy(self):
        entries = [dict(thread_id=t, turn_ids=['turn'], log_path=p) for t, p in [('parent', 'p'), ('child', 'c')]]
        result = self.run_report({'p': [event()], 'c': [event(), event(thread='child', response='r2')]}, entries)
        self.assertEqual(result['usage']['total_tokens'], 220)
        self.assertEqual(result['wall_clock_seconds'], 120)

    def test_global_response_conflict(self):
        result = self.run_report({'p': [event(), event(amount=120)]})
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['usage']['total_tokens'], 110)

    def test_invalid_subset(self):
        broken = event(); broken['payload']['usage']['reasoning_output_tokens'] = 11
        self.assertEqual(self.run_report({'p': [broken]})['status'], 'partial')

    def test_unconfirmed_inventory(self):
        self.assertEqual(self.run_report({'p': [event()]}, scope_complete=False)['status'], 'partial')

    def test_completion_after_cutoff(self):
        done = {'timestamp': '2026-10-07T01:05:00Z', 'type': 'event_msg',
                'payload': {'type': 'task_complete', 'turn_id': 'turn'}}
        self.assertEqual(self.run_report({'p': [event(), done]})['sessions'][0]['completed_turn_ids'], [])

    def test_malformed_shapes(self):
        broken = event(); broken['payload']['usage'] = []
        result = self.run_report({'p': [None, [], {'payload': []}, broken, event()]})
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['usage']['total_tokens'], 110)


def claude(msg='msg_1', session='s1', stamp='2026-10-07T01:01:00Z', uuid=None, out=10,
           thinking=4, request='req_1', model='claude-test'):
    return {'type': 'assistant', 'sessionId': session, 'uuid': uuid or f'u-{msg}-{out}', 'timestamp': stamp,
            'requestId': request, 'message': {'id': msg, 'model': model, 'content': [{'type': 'text', 'text': 'x'}],
            'usage': {'input_tokens': 5, 'cache_read_input_tokens': 80, 'cache_creation_input_tokens': 15,
                      'output_tokens': out, 'output_tokens_details': {'thinking_tokens': thinking}}}}


def prompt(uuid, session='s1'):
    return {'type': 'user', 'sessionId': session, 'uuid': uuid, 'timestamp': '2026-10-07T01:00:30Z',
            'message': {'role': 'user', 'content': 'x'}}


class ClaudeTests(unittest.TestCase):
    def run_report(self, logs, entry=None, **changes):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            for name, records in logs.items():
                (base / name).parent.mkdir(parents=True, exist_ok=True)
                (base / name).write_text('\n'.join(json.dumps(r) for r in records))
            session = dict(session_id='s1', log_path='s1.jsonl')
            session.update(entry or {})
            manifest = dict(task_id='test', started_at='2026-10-07T01:00:00Z',
                            ended_at='2026-10-07T01:02:00Z', scope_complete=True, sessions=[session])
            manifest.update(changes)
            return module.report(manifest, base, datetime(2026, 10, 7, 1, 3, tzinfo=timezone.utc))

    def test_mapping_and_block_duplicates(self):
        result = self.run_report({'s1.jsonl': [claude(), claude(), claude()]})
        usage = result['usage']
        self.assertEqual(result['status'], 'recorded_snapshot')
        self.assertEqual(usage['input_tokens'], 100)
        self.assertEqual(usage['cached_input_tokens'], 80)
        self.assertEqual(usage['cache_write_input_tokens'], 15)
        self.assertEqual(usage['output_tokens'], 10)
        self.assertEqual(usage['reasoning_output_tokens'], 4)
        self.assertEqual(usage['total_tokens'], 110)
        self.assertEqual(result['sessions'][0]['duplicates_skipped'], 2)

    def test_last_duplicate_wins(self):
        result = self.run_report({'s1.jsonl': [claude(out=3), claude(out=10)]})
        self.assertEqual(result['usage']['output_tokens'], 10)
        self.assertEqual(result['sessions'][0]['duplicates_updated'], 1)

    def test_request_id_fallback(self):
        record = claude(msg=None)
        result = self.run_report({'s1.jsonl': [record, claude(msg=None), claude(msg=None, request='req_2')]})
        self.assertEqual(result['usage']['total_tokens'], 220)

    def test_time_owner_and_synthetic(self):
        logs = {'s1.jsonl': [claude(), claude('late', stamp='2026-10-07T01:02:30Z'),
                             claude('copied', session='old'), claude('err', model='<synthetic>')]}
        result = self.run_report(logs)
        self.assertEqual(result['usage']['total_tokens'], 110)
        self.assertEqual(result['sessions'][0]['foreign_skipped'], 1)
        self.assertEqual(result['sessions'][0]['synthetic_skipped'], 1)

    def test_uuid_range(self):
        logs = {'s1.jsonl': [claude('before'), prompt('p1'), claude('in1'), claude('in2', uuid='end'),
                             claude('after')]}
        result = self.run_report(logs, {'from_uuid': 'p1', 'to_uuid': 'end'})
        self.assertEqual(result['usage']['total_tokens'], 220)
        missing = self.run_report(logs, {'from_uuid': 'nope'})
        self.assertEqual(missing['status'], 'partial')

    def test_subagents_option(self):
        logs = {'s1.jsonl': [claude()], 's1/subagents/agent-a1.jsonl': [claude('sub1')],
                's1/subagents/agent-a2.jsonl': [claude('sub2'), claude()]}
        result = self.run_report(logs)
        self.assertEqual(result['usage']['total_tokens'], 330)
        self.assertEqual(result['sessions'][0]['subagent_files'], 2)
        self.assertEqual(result['sessions'][0]['subagent_usage']['total_tokens'], 220)
        self.assertEqual(self.run_report(logs, {'include_subagents': False})['usage']['total_tokens'], 110)
        only = self.run_report(logs, {'agent_ids': ['a1']})
        self.assertEqual(only['usage']['total_tokens'], 220)

    def test_empty_and_bad_thinking(self):
        self.assertEqual(self.run_report({'s1.jsonl': [prompt('p1')]})['status'], 'partial')
        result = self.run_report({'s1.jsonl': [claude(out=0, thinking=10)]})
        self.assertEqual(result['usage']['reasoning_output_tokens'], 0)
        self.assertTrue(result['notes'])
        self.assertEqual(result['status'], 'recorded_snapshot')

    def test_duplicate_session_id_rejected(self):
        logs = {'s1.jsonl': [claude()]}
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 's1.jsonl').write_text(json.dumps(claude()))
            entry = dict(session_id='s1', log_path='s1.jsonl')
            manifest = dict(task_id='t', started_at='2026-10-07T01:00:00Z', ended_at='2026-10-07T01:02:00Z',
                            scope_complete=True, sessions=[entry, dict(entry)])
            with self.assertRaisesRegex(ValueError, 'duplicate session_id in manifest: s1'):
                module.report(manifest, base, datetime(2026, 10, 7, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(self.run_report(logs)['status'], 'recorded_snapshot')

    def test_missing_output_details_noted(self):
        record = claude()
        del record['message']['usage']['output_tokens_details']
        result = self.run_report({'s1.jsonl': [record, record, claude('msg_2')]})
        self.assertEqual(result['usage']['reasoning_output_tokens'], 4)
        self.assertEqual(result['sessions'][0]['reasoning_unrecorded'], 1)
        self.assertTrue(any('no output_tokens_details' in n and ': 1 responses' in n for n in result['notes']))
        self.assertEqual(result['status'], 'recorded_snapshot')
        clean = self.run_report({'s1.jsonl': [claude()]})
        self.assertEqual(clean['notes'], [])

    def test_thinking_unverified_counted_after_dedup(self):
        bad = claude(out=0, thinking=10)
        result = self.run_report({'s1.jsonl': [bad, bad, bad, claude('msg_2', out=1, thinking=5)]})
        self.assertEqual(result['sessions'][0]['thinking_unverified'], 2)
        self.assertTrue(any(': 2 responses had invalid thinking_tokens' in n for n in result['notes']))
        # A later valid duplicate line replaces the flag (last record wins).
        fixed = self.run_report({'s1.jsonl': [bad, claude(out=10, thinking=4)]})
        self.assertEqual(fixed['sessions'][0]['thinking_unverified'], 0)

    def test_subagent_option_types(self):
        logs = {'s1.jsonl': [claude()]}
        for bad in ({'include_subagents': 'false'}, {'include_subagents': 0}, {'agent_ids': 'a1'},
                    {'agent_ids': [1]}, {'agent_ids': ['']}):
            with self.assertRaises(ValueError, msg=str(bad)):
                self.run_report(logs, bad)
        self.assertEqual(self.run_report(logs, {'include_subagents': False, 'agent_ids': []})['status'],
                         'recorded_snapshot')

    def test_cli_invalid_manifest_message(self):
        import subprocess
        import sys
        script = Path(__file__).parents[1] / 'scripts/report.py'
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            cases = {
                'dup.json': (dict(task_id='t', started_at='2026-10-07T01:00:00Z', scope_complete=True,
                                  sessions=[dict(session_id='s1', log_path='x'), dict(session_id='s1', log_path='x')]),
                             'duplicate session_id in manifest: s1'),
                'key.json': (dict(task_id='t', started_at='2026-10-07T01:00:00Z'), "missing key 'sessions'"),
                'type.json': (dict(task_id='t', started_at='2026-10-07T01:00:00Z',
                                   sessions=[dict(session_id='s1', log_path='x', include_subagents='yes')]),
                              'include_subagents must be true or false'),
            }
            for name, (manifest, expected) in cases.items():
                (base / name).write_text(json.dumps(manifest))
                proc = subprocess.run([sys.executable, str(script), str(base / name)], capture_output=True, text=True)
                self.assertEqual(proc.returncode, 2, name)
                self.assertIn('Invalid manifest: ', proc.stderr)
                self.assertIn(expected, proc.stderr, name)
            (base / 'bad.json').write_text('{oops')
            proc = subprocess.run([sys.executable, str(script), str(base / 'bad.json')], capture_output=True, text=True)
            self.assertIn('Invalid manifest: JSONDecodeError: Expecting property name', proc.stderr)

    def test_cli_broken_pipe(self):
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            (base / 's1.jsonl').write_text(json.dumps(claude()))
            (base / 'm.json').write_text(json.dumps(dict(task_id='t', started_at='2026-10-07T01:00:00Z',
                                         ended_at='2026-10-07T01:02:00Z', scope_complete=True,
                                         sessions=[dict(session_id='s1', log_path='s1.jsonl')])))
            script = Path(__file__).parents[1] / 'scripts/report.py'
            proc = subprocess.Popen([sys.executable, str(script), str(base / 'm.json')],
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            proc.stdout.read(1)
            proc.stdout.close()
            err = proc.stderr.read()
            proc.stderr.close()
            proc.wait()
            self.assertNotIn(b'Traceback', err)


if __name__ == '__main__':
    unittest.main()
