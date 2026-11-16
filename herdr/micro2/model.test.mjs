import test from 'node:test';
import assert from 'node:assert/strict';
import { agentsFrom, assignSlots, lighting, pressedSlot } from './model.mjs';
const agent = (address, status = 'working') => ({ address, status });

test('slot assignments survive sidebar reorder and status changes', () => {
  const before = assignSlots([], [agent('t1'), agent('devbox/t1')]);
  const after = assignSlots(before, [agent('devbox/t1', 'blocked'), agent('t1', 'done')]);
  assert.deepEqual(after.slice(0, 2), [agent('t1', 'done'), agent('devbox/t1', 'blocked')]);
});
test('only closed agents free slots; overflow enters the first freed slot', () => {
  const agents = Array.from({ length: 8 }, (_, i) => agent(`t${i}`));
  const before = assignSlots([], agents);
  assert.equal(before.length, 6);
  const after = assignSlots(before, agents.filter(a => a.address !== 't2'));
  assert.equal(after[2].address, 't6');
  assert.equal(after[5].address, 't5');
  assert.deepEqual(assignSlots(after, []), Array(6).fill(null));
});
test('extract local and remote agents without allocating ordinary shell terminals', () => {
  const snapshot = { spaces: [{ name: 'Remote', tabs: [{ terminals: [
    { terminal: 'devbox/t1', status: 'working', sub_agents: [
      { terminal: 'devbox/t2', status: 'blocked' },
    ] },
    { terminal: 'devbox/t3', status: null },
  ] }] }] };
  assert.deepEqual(agentsFrom(snapshot).map(a => a.address), ['devbox/t1', 'devbox/t2']);
  assert.throws(() => agentsFrom({}), /Invalid/);
});
test('all four Herdr states and unused slots have distinct lighting', () => {
  const slots = assignSlots([], ['working', 'blocked', 'done', 'idle'].map((s, i) => agent(`t${i}`, s)));
  const payload = lighting(slots);
  assert.deepEqual(payload.map(p => p.c), [0x0060ff, 0xff6a00, 0x00ff30, 0x606060, 0, 0]);
  assert.deepEqual(payload.map(p => p.e), [4, 4, 1, 1, 0, 0]);
});
test('only the six agent key down events focus a session', () => {
  assert.equal(pressedSlot({ m: 'v.oai.hid', p: { k: 'AG05', act: 1 } }), 5);
  for (const k of ['AG06', 'ACT06', 'AG00'])
    assert.equal(pressedSlot({ m: 'v.oai.hid', p: { k, act: 0 } }), null);
  assert.equal(pressedSlot({ m: 'v.oai.hid', p: { k: 'AG06', act: 1 } }), null);
  assert.equal(pressedSlot({}), null);
});
