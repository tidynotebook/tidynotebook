"""Mocked Docker protocol tests. These tests run no Docker commands."""
import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import owned_container

CID = 'a' * 64
OWNER = 'b' * 32


class DockerProtocol:
    def __init__(self, failure='timeout', wrong_owner=False):
        self.exists = False
        self.running = False
        self.failure = failure
        self.wrong_owner = wrong_owner
        self.removals = []
        self.calls = []
        self.inspections = 0

    def run(self, args, **kwargs):
        self.calls.append(args)
        self.assert_deadline(kwargs['timeout'])
        if args[1] == 'create':
            self.exists = self.failure not in ('create-unresolved', 'create-error')
            if self.failure == 'create-error':
                return subprocess.CompletedProcess(args, 1, b'', b'controlled create error')
            if self.failure.startswith('create-'):
                raise subprocess.TimeoutExpired(args, kwargs['timeout'], output=b'create partial', stderr=b'create timeout')
            return subprocess.CompletedProcess(args, 0, (CID + '\n').encode(), b'')
        if args[1:3] == ['container', 'inspect']:
            self.inspections += 1
            if self.failure == 'post-inspect-timeout' and self.inspections == 2:
                raise subprocess.TimeoutExpired(args, kwargs['timeout'], output=b'partial inspect', stderr=b'inspect timeout')
            if self.failure == 'inspect-error':
                return subprocess.CompletedProcess(args, 1, b'', b'Cannot connect to daemon')
            if not self.exists:
                return subprocess.CompletedProcess(args, 1, b'', b'Error: No such container: ' + args[-1].encode())
            value = {'Id': CID, 'Owner': 'other' if self.wrong_owner else OWNER,
                     'Running': self.running, 'ExitCode': 0}
            return subprocess.CompletedProcess(args, 0, json.dumps(value).encode(), b'')
        if args[1] == 'start':
            self.running = True
            if self.failure == 'timeout':
                raise subprocess.TimeoutExpired(args, kwargs['timeout'], output=b'partial stdout', stderr=b'partial stderr')
            if self.failure == 'error':
                raise OSError('controlled client error')
            self.running = False
            return subprocess.CompletedProcess(args, 0, b'complete', b'')
        if args[1:3] == ['container', 'rm']:
            assert args == ['docker', 'container', 'rm', '--force', CID]
            self.removals.append(CID)
            if self.failure in ('cleanup-timeout', 'cleanup-timeout-removed'):
                if self.failure == 'cleanup-timeout-removed':
                    self.exists = False
                raise subprocess.TimeoutExpired(args, kwargs['timeout'], output=b'remove partial', stderr=b'remove timeout')
            self.exists = False
            return subprocess.CompletedProcess(args, 0, CID.encode(), b'')
        raise AssertionError(args)

    def assert_deadline(self, value):
        assert 0 < value <= 125


class OwnedContainerTests(unittest.TestCase):
    def invoke(self, protocol, path):
        with patch.object(owned_container.uuid, 'uuid4') as uuid, patch.object(owned_container.subprocess, 'run', side_effect=protocol.run):
            uuid.return_value.hex = OWNER
            return owned_container.run_owned('case', 'sha256:' + 'c' * 64, [], [], path, timeout=1)

    def test_timeout_is_fail_and_exact_owned_container_is_removed(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol()
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            record = error.exception.record
            self.assertEqual(record['status'], 'FAIL')
            self.assertTrue(record['timed_out'])
            self.assertTrue(record['cleanup']['complete'])
            self.assertEqual(record['container_id'], CID)
            self.assertEqual(fake.removals, [CID])
            self.assertFalse(fake.exists)
            self.assertEqual((pathlib.Path(path) / 'case.stdout').read_bytes(), b'partial stdout')
            self.assertEqual((pathlib.Path(path) / 'case.stderr').read_bytes(), b'partial stderr')
            self.assertEqual(json.loads((pathlib.Path(path) / 'case.run.json').read_text()), record)
            self.assertTrue(any(event.get('running') for event in record['cleanup']['events']))

    def test_client_error_still_cleans_owned_container(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('error')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertTrue(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [CID])

    def test_other_owner_is_never_removed(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol(wrong_owner=True)
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertFalse(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [])

    def test_success_also_removes_exact_container(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('success')
            result, record = self.invoke(fake, path)
            self.assertEqual(result.stdout, b'complete')
            self.assertEqual(record['status'], 'PASS')
            self.assertTrue(record['cleanup']['complete'])
            self.assertEqual(fake.removals, [CID])

    def test_create_timeout_recovers_only_the_exact_owned_name(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('create-timeout')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertTrue(error.exception.record['timed_out'])
            self.assertTrue(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [CID])
            inspections = [args for args in fake.calls if args[1:3] == ['container', 'inspect']]
            self.assertEqual(inspections[0][-1], 't15-' + OWNER)
            self.assertEqual(inspections[-1][-1], CID)

    def test_unresolved_create_timeout_is_not_reported_as_clean(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('create-unresolved')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertFalse(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [])

    def test_cleanup_timeout_preserves_error_and_stays_fail(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('cleanup-timeout')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            record = error.exception.record
            self.assertFalse(record['cleanup']['complete'])
            event = next(e for e in record['cleanup']['events'] if e['action'] == 'remove_timeout')
            self.assertEqual(event['stderr'], 'remove timeout')
            self.assertEqual(event['id'], CID)

    def test_cleanup_timeout_is_fail_even_if_removal_finishes(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('cleanup-timeout-removed')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertTrue(error.exception.record['cleanup']['complete'])
            self.assertTrue(error.exception.record['timed_out'])
            self.assertEqual(error.exception.record['status'], 'FAIL')

    def test_daemon_error_is_not_absence(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('inspect-error')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertFalse(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [])

    def test_inspection_timeout_does_not_replace_probe_output(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('post-inspect-timeout')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertTrue(error.exception.record['cleanup']['complete'])
            self.assertTrue(error.exception.record['timed_out'])
            self.assertEqual((pathlib.Path(path) / 'case.stdout').read_bytes(), b'complete')
            self.assertEqual((pathlib.Path(path) / 'case.inspect-after-start.timeout.stdout').read_bytes(), b'partial inspect')

    def test_failed_create_without_identity_is_unconfirmed(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('create-error')
            with self.assertRaises(owned_container.InvocationFailure) as error:
                self.invoke(fake, path)
            self.assertFalse(error.exception.record['cleanup']['complete'])
            self.assertEqual(fake.removals, [])

    def test_names_and_labels_are_unique(self):
        with tempfile.TemporaryDirectory() as path:
            fake = DockerProtocol('success')
            other = 'd' * 32
            with patch.object(owned_container.subprocess, 'run', side_effect=fake.run), patch.object(owned_container.uuid, 'uuid4') as uuid:
                uuid.return_value.hex = OWNER
                owned_container.run_owned('one', 'sha256:' + 'c' * 64, [], [], path)
                uuid.return_value.hex = other
                # The fake still represents OWNER. The second invocation must
                # refuse ownership rather than remove the first run's identity.
                with self.assertRaises(owned_container.InvocationFailure):
                    owned_container.run_owned('two', 'sha256:' + 'c' * 64, [], [], path)
            creates = [args for args in fake.calls if args[1] == 'create']
            self.assertNotEqual(creates[0][3], creates[1][3])
            self.assertIn(owned_container.LABEL + '=' + OWNER, creates[0])
            self.assertIn(owned_container.LABEL + '=' + other, creates[1])


if __name__ == '__main__':
    unittest.main()
