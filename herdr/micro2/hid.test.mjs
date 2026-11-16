import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Keyboard, reports } from './hid.mjs';

test('RPC messages span fixed-size HID reports without corrupting Unicode', () => {
  const message = { method: 'v.oai.thstatus', params: Array(6).fill({ label: 'é😀', c: 0xff6a00 }), id: 101 };
  const chunks = reports(message);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) {
    assert.equal(chunk.length, 64);
    assert.equal(chunk[0], 6);
    assert.equal(chunk[1], 2);
    assert.ok(chunk[2] <= 61);
  }
  assert.deepEqual(JSON.parse(chunks.map(c => c.subarray(3, 3 + c[2]).toString()).join('')), message);
});

class Handle extends EventEmitter {
  chunks = [];
  async write(report) {
    this.chunks.push(report.subarray(3, 3 + report[2]).toString());
    try {
      const request = JSON.parse(this.chunks.join(''));
      this.chunks = [];
      // Notifications may be interleaved with the matching request response.
      this.receive({ m: 'v.oai.hid', p: { k: 'AG00', act: 1 } });
      this.receive({ id: request.id, result: { ok: 1 } });
    } catch { /* waiting for the remaining chunks */ }
  }
  receive(message) {
    for (const report of reports(message)) this.emit('data', report);
    const end = Buffer.alloc(64);
    end[0] = 6; end[1] = 2; end[2] = 1; end[3] = 10;
    this.emit('data', end);
  }
  async close() { this.closed = true; }
}

test('fragmented replies resolve writes and key events remain independent', async () => {
  const handle = new Handle();
  const events = [];
  const keyboard = new Keyboard(handle, event => events.push(event));
  await keyboard.show(Array.from({ length: 6 }, (_, id) => ({ id, c: 0xff6a00, e: 4, b: 1, s: 0.35 })));
  assert.equal(events.length, 1);
  assert.equal(events[0].p.k, 'AG00');
  await keyboard.close();
  assert.equal(handle.closed, true);
});

test('USB disconnection rejects pending operations', async () => {
  const handle = new EventEmitter();
  handle.write = async () => {};
  handle.close = async () => {};
  const keyboard = new Keyboard(handle, () => {});
  const write = keyboard.show([]);
  handle.emit('error', new Error('unplugged'));
  await assert.rejects(write, /unplugged/);
  await keyboard.close();
});
