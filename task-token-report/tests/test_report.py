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


if __name__ == '__main__':
    unittest.main()
