#!/usr/bin/env python3
"""Audit and synchronize desktop and managed SSH Codex model catalogs."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shlex
import subprocess
import socket
import struct
import sys
import time


class SyncError(Exception):
    pass


def run(argv, timeout=45):
    try:
        p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise SyncError(f'Command unavailable or timed out: {argv[0]}') from e
    if p.returncode:
        # CLI stderr and server errors can contain credentials or runtime content.
        if argv[0] == 'ssh':
            for line in p.stderr.splitlines():
                try:
                    detail = json.loads(line)
                except ValueError:
                    continue
                if isinstance(detail, dict) and isinstance(detail.get('error'), str):
                    raise SyncError(f"Remote worker failed: {detail['error']}")
        raise SyncError(f'Command failed (exit {p.returncode}): {argv[0]}')
    return p.stdout


class Rpc:
    def __init__(self, argv):
        self.p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, bufsize=0)
        self.buffer = b''
        self.seq = 0
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.p.stdout, selectors.EVENT_READ)

    def close(self):
        self.selector.close()
        self.p.stdin.close()
        try:
            self.p.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.p.terminate()
            try:
                self.p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.p.kill()
                self.p.wait()

    def send(self, message):
        self.p.stdin.write((json.dumps(message) + '\n').encode())
        self.p.stdin.flush()

    def call(self, method, params):
        self.seq += 1
        seq = self.seq
        self.send({'id': seq, 'method': method, 'params': params})
        deadline = time.monotonic() + 40
        while True:
            if b'\n' not in self.buffer:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not self.selector.select(remaining):
                    raise SyncError(f'RPC timed out: {method}')
                chunk = os.read(self.p.stdout.fileno(), 65536)
                if not chunk:
                    raise SyncError(f'RPC transport closed: {method}')
                self.buffer += chunk
                continue
            line, self.buffer = self.buffer.split(b'\n', 1)
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if 'method' in message and 'id' in message:
                self.send({'id': message['id'], 'error': {'code': -32601,
                           'message': 'Unsupported client request'}})
            if message.get('id') == seq and 'method' not in message:
                if 'error' in message:
                    raise SyncError(f'RPC rejected: {method}')
                return message['result']

    def initialize(self):
        self.call('initialize', {'clientInfo': {'name': 'codex_host_sync',
                  'version': '1.0.0'}, 'capabilities': {'experimentalApi': True}})
        self.send({'method': 'initialized', 'params': {}})

    def pages(self, method, params, key='data'):
        items, cursor, seen = [], None, set()
        while True:
            page = self.call(method, dict(params, **({'cursor': cursor} if cursor else {})))
            items.extend(page[key])
            cursor = page.get('nextCursor')
            if not cursor:
                return items
            if cursor in seen:
                raise SyncError(f'Repeated pagination cursor: {method}')
            seen.add(cursor)


class UnixRpc(Rpc):
    """The managed control socket speaks WebSocket, including through raw proxy."""
    def __init__(self, path):
        self.seq = 0
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(40)
        try:
            self.sock.connect(path)
            key = base64.b64encode(os.urandom(16)).decode()
            request = ('GET / HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\n'
                       'Connection: Upgrade\r\nSec-WebSocket-Version: 13\r\n'
                       f'Sec-WebSocket-Key: {key}\r\n\r\n')
            self.sock.sendall(request.encode())
            header = bytearray()
            while not header.endswith(b'\r\n\r\n'):
                header.extend(self.exact(1))
                if len(header) > 16384:
                    raise SyncError('Oversized WebSocket handshake')
            lines = header.decode().split('\r\n')
            fields = {line.split(':', 1)[0].lower(): line.split(':', 1)[1].strip()
                      for line in lines[1:] if ':' in line}
            accept = base64.b64encode(hashlib.sha1(
                (key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode()
            if ' 101 ' not in lines[0] or fields.get('sec-websocket-accept') != accept:
                raise SyncError('WebSocket handshake rejected')
        except Exception:
            self.sock.close()
            raise

    def exact(self, length):
        data = bytearray()
        while len(data) < length:
            chunk = self.sock.recv(length - len(data))
            if not chunk:
                raise SyncError('Managed WebSocket closed')
            data.extend(chunk)
        return bytes(data)

    def frame(self, payload, opcode=1):
        mask = os.urandom(4)
        size = len(payload)
        prefix = bytes([0x80 | opcode])
        if size < 126:
            prefix += bytes([0x80 | size])
        elif size < 65536:
            prefix += bytes([0x80 | 126]) + struct.pack('!H', size)
        else:
            prefix += bytes([0x80 | 127]) + struct.pack('!Q', size)
        self.sock.sendall(prefix + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(payload)))

    def send(self, message):
        self.frame(json.dumps(message).encode())

    def receive(self, deadline):
        fragments = bytearray()
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise SyncError('Managed WebSocket timed out')
            self.sock.settimeout(remaining)
            first, second = self.exact(2)
            opcode, size = first & 15, second & 127
            if size == 126:
                size = struct.unpack('!H', self.exact(2))[0]
            elif size == 127:
                size = struct.unpack('!Q', self.exact(8))[0]
            if second & 128 or size > 16 * 1024 * 1024:
                raise SyncError('Invalid managed WebSocket frame')
            payload = self.exact(size)
            if opcode == 8:
                raise SyncError('Managed WebSocket closed')
            if opcode == 9:
                self.frame(payload, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1):
                raise SyncError('Unsupported managed WebSocket frame')
            fragments.extend(payload)
            if len(fragments) > 16 * 1024 * 1024:
                raise SyncError('Oversized managed WebSocket message')
            if first & 128:
                return json.loads(fragments)

    def call(self, method, params):
        self.seq += 1
        seq = self.seq
        self.send({'id': seq, 'method': method, 'params': params})
        deadline = time.monotonic() + 40
        while True:
            message = self.receive(deadline)
            if 'method' in message and 'id' in message:
                self.send({'id': message['id'], 'error': {'code': -32601,
                           'message': 'Unsupported client request'}})
            if message.get('id') == seq and 'method' not in message:
                if 'error' in message:
                    raise SyncError(f'RPC rejected: {method}')
                return message['result']

    def close(self):
        self.sock.close()


def catalog(models):
    return {m['model']: sorted(x['reasoningEffort'] for x in
            m.get('supportedReasoningEfforts', [])) for m in models if not m.get('hidden', False)}


def active_threads(rpc):
    ids = rpc.pages('thread/loaded/list', {}, 'data')
    busy = []
    for tid in ids:
        thread = rpc.call('thread/read', {'threadId': tid, 'includeTurns': False})['thread']
        status = thread.get('status', {}).get('type')
        if status in ('active', 'systemError') or status not in ('idle', 'notLoaded'):
            busy.append(tid)
    return busy


def probe(binary, remote=False):
    version = run([binary, '--version']).strip().split()[-1]
    daemon = json.loads(run([binary, 'app-server', 'daemon', 'version'])) if remote else None
    if remote and daemon.get('status') != 'running':
        raise SyncError('Remote managed daemon is not running. Bootstrap/start it explicitly first.')
    rpc = UnixRpc(daemon['socketPath']) if remote else Rpc([binary, 'app-server'])
    try:
        rpc.initialize()
        account = rpc.call('account/read', {'refreshToken': False}).get('account')
        if not account or account.get('type') != 'chatgpt' or not account.get('email'):
            raise SyncError('ChatGPT account identity unavailable. Sign in independently on this host.')
        identity = hashlib.sha256(account['email'].strip().lower().encode()).hexdigest()
        models = catalog(rpc.pages('model/list', {'limit': 100, 'includeHidden': False}))
        if not models:
            raise SyncError('Empty model catalog')
        busy = active_threads(rpc) if remote else []
        return {'cli': version, 'daemon': daemon, 'models': models,
                'identity': identity, 'busy': busy}
    finally:
        rpc.close()


def version_tuple(version):
    match = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)(?:[-+].*)?', version or '')
    if not match:
        raise SyncError('Unrecognized Codex version')
    return tuple(map(int, match.groups()))


def differences(local, remote):
    a, b = local['models'], remote['models']
    return {'missing': sorted(set(a) - set(b)), 'extra': sorted(set(b) - set(a)),
            'effort_mismatch': sorted(m for m in set(a) & set(b) if a[m] != b[m])}


def remote_worker(binary, action, expected_identity, target):
    before = probe(binary, True)
    if action == 'probe':
        return before
    if before['identity'] != expected_identity:
        raise SyncError('Remote account differs from local account')
    if before['busy']:
        raise SyncError('Active or unknown-status remote threads. Retry after they finish.')
    if action == 'update':
        run([binary, 'app-server', 'daemon', 'update'], timeout=240)
    else:
        run([binary, 'app-server', 'daemon', 'restart'], timeout=90)
    after = probe(binary, True)
    if version_tuple(after['daemon'].get('appServerVersion')) < version_tuple(target):
        raise SyncError('Managed update did not reach the desktop version. Release may not be published yet.')
    return after


def ssh_worker(host, action='probe', identity='', target=''):
    alias = host['ssh']
    if not re.fullmatch(r'[A-Za-z0-9_.@-]+', alias) or alias.startswith('-'):
        raise SyncError('Invalid SSH alias')
    source = Path(__file__).read_text()
    args = [host.get('python', 'python3'), '-c', source, '--worker', action,
            '--binary', host.get('binary', 'codex'), '--identity', identity, '--target', target]
    # Login shells preserve the installation PATH used by desktop SSH bootstrap.
    command = shlex.join(['bash', '-lc', shlex.join(args)])
    return json.loads(run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                          '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
                          alias, command], timeout=330))


def desktop_binary(config):
    if config.get('local_binary'):
        return config['local_binary']
    # Prefer the app bundle over an older Nix/Homebrew CLI on PATH.
    for app in ('ChatGPT', 'Codex'):
        root = Path('/Applications') / f'{app}.app/Contents/Resources/codex-cli'
        for suffix in ('CodexCLI.app/Contents/MacOS/codex', 'bin/codex', ''):
            path = root / suffix
            if path.is_file() and os.access(path, os.X_OK):
                return str(path)
    raise SyncError('Set local_binary to the running desktop bundle Codex executable')


def summary(name, state, local):
    delta = differences(local, state)
    daemon_version = (state.get('daemon') or {}).get('appServerVersion')
    return {'host': name, 'cli': state['cli'], 'daemon': daemon_version,
            'account_matches': state['identity'] == local['identity'],
            'busy_thread_count': len(state['busy']), 'models': sorted(state['models']),
            **delta}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--config', type=Path)
    p.add_argument('--apply', action='store_true', help='Update stale managed daemons and restart mismatched catalogs')
    p.add_argument('--worker', choices=('probe', 'update', 'restart'), help=argparse.SUPPRESS)
    p.add_argument('--binary', default='codex', help=argparse.SUPPRESS)
    p.add_argument('--identity', default='', help=argparse.SUPPRESS)
    p.add_argument('--target', default='', help=argparse.SUPPRESS)
    args = p.parse_args()
    if args.worker:
        print(json.dumps(remote_worker(args.binary, args.worker, args.identity, args.target)))
        return 0
    if not args.config:
        p.error('--config is required')
    config = json.loads(args.config.read_text())
    local = probe(desktop_binary(config))
    hosts = config['hosts']
    if not hosts:
        raise SyncError('Configure at least one SSH host')
    states = [ssh_worker(h) for h in hosts]
    print(json.dumps({'phase': 'audit', 'local': summary('desktop', local, local),
                      'hosts': [summary(h['ssh'], s, local) for h, s in zip(hosts, states)]}), flush=True)
    if args.apply:
        # Preflight every host before changing any. Recheck busy state inside each worker.
        if any(s['identity'] != local['identity'] for s in states):
            raise SyncError('Account mismatch. No hosts updated.')
        if any(s['busy'] for s in states):
            raise SyncError('Active or unknown-status remote work. No hosts updated.')
        for i, (host, state) in enumerate(zip(hosts, states)):
            daemon_version = state['daemon'].get('appServerVersion')
            stale = version_tuple(daemon_version) < version_tuple(local['cli'])
            delta = differences(local, state)
            if stale or any(delta.values()):
                action = 'update' if stale else 'restart'
                print(json.dumps({'phase': action, 'host': host['ssh']}), flush=True)
                states[i] = ssh_worker(host, action, local['identity'], local['cli'])
        print(json.dumps({'phase': 'verified', 'hosts': [summary(h['ssh'], s, local)
                                                       for h, s in zip(hosts, states)]}), flush=True)
    equal = all(s['identity'] == local['identity'] and not any(differences(local, s).values())
                and version_tuple(s['daemon'].get('appServerVersion')) >= version_tuple(local['cli'])
                for s in states)
    return 0 if equal else 2


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (SyncError, KeyError, ValueError, OSError) as error:
        # Do not echo arbitrary server responses, auth state, or config contents.
        message = str(error) if isinstance(error, SyncError) else type(error).__name__
        print(json.dumps({'error': message}), file=sys.stderr)
        sys.exit(1)
