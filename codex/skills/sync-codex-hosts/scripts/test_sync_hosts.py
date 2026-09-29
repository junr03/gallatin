import importlib.util
import json
from pathlib import Path
import socket
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_hosts', Path(__file__).with_name('sync_hosts.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def state(version='0.159.0', busy=None, identity='same'):
    return {'cli': version, 'daemon': {'appServerVersion': version},
            'identity': identity, 'busy': busy or [],
            'models': {'gpt-6.1-sol': ['medium', 'high']}}


class SyncTests(unittest.TestCase):
    def test_refuses_active_work_before_mutation(self):
        with patch.object(sync, 'probe', return_value=state(busy=['active'])), patch.object(sync, 'run') as run:
            with self.assertRaises(sync.SyncError):
                sync.remote_worker('codex', 'update', 'same', '0.159.0')
            run.assert_not_called()

    def test_refuses_account_mismatch(self):
        with patch.object(sync, 'probe', return_value=state(identity='different')), patch.object(sync, 'run') as run:
            with self.assertRaises(sync.SyncError):
                sync.remote_worker('codex', 'update', 'same', '0.159.0')
            run.assert_not_called()

    def test_update_checks_running_daemon(self):
        with patch.object(sync, 'probe', side_effect=[state('0.155.1'), state('0.155.1')]), patch.object(sync, 'run') as run:
            with self.assertRaises(sync.SyncError):
                sync.remote_worker('codex', 'update', 'same', '0.159.0')
            run.assert_called_once_with(['codex', 'app-server', 'daemon', 'update'], timeout=240)

    def test_no_mutation_when_second_host_is_busy(self):
        with tempfile.TemporaryDirectory() as root:
            config = Path(root) / 'hosts.json'
            config.write_text(json.dumps({'hosts': [{'ssh': 'a'}, {'ssh': 'b'}]}))
            with patch('sys.argv', ['sync', '--config', str(config), '--apply']), patch.object(sync, 'desktop_binary', return_value='local'), patch.object(sync, 'probe', return_value=state()), patch.object(sync, 'ssh_worker', side_effect=[state(), state(busy=['active'])]) as worker, patch('builtins.print'):
                with self.assertRaises(sync.SyncError):
                    sync.main()
                self.assertEqual(worker.call_count, 2)
                self.assertTrue(all(len(call.args) == 1 for call in worker.call_args_list))

    def test_pagination_and_effort_drift(self):
        rpc = object.__new__(sync.Rpc)
        with patch.object(rpc, 'call', side_effect=[{'data': [{'model': 'a'}], 'nextCursor': 'next'}, {'data': [{'model': 'b'}], 'nextCursor': None}]):
            self.assertEqual(len(rpc.pages('model/list', {})), 2)
        remote = state()
        remote['models']['gpt-6.1-sol'] = ['medium']
        self.assertEqual(sync.differences(state(), remote)['effort_mismatch'], ['gpt-6.1-sol'])

    def test_websocket_fragmentation_ping_and_client_mask(self):
        client, server = socket.socketpair()
        rpc = object.__new__(sync.UnixRpc)
        rpc.sock, rpc.seq = client, 0
        errors = []
        def serve():
            try:
                header = server.recv(2)
                length = header[1] & 127
                if length == 126:
                    length = struct.unpack('!H', server.recv(2))[0]
                mask = server.recv(4)
                body = bytearray()
                while len(body) < length:
                    body.extend(server.recv(length - len(body)))
                request = json.loads(bytes(b ^ mask[i % 4] for i, b in enumerate(body)))
                self.assertTrue(header[1] & 128)
                result = json.dumps({'id': request['id'], 'result': {'ok': True}}).encode()
                server.sendall(b'\x89\x01x')
                server.sendall(bytes([1, 5]) + result[:5])
                server.sendall(bytes([128, len(result)-5]) + result[5:])
            except Exception as error:
                errors.append(error)
        thread = threading.Thread(target=serve)
        thread.start()
        try:
            self.assertEqual(rpc.call('model/list', {}), {'ok': True})
            thread.join(2)
            self.assertFalse(errors)
        finally:
            client.close()
            server.close()


if __name__ == '__main__':
    unittest.main()
