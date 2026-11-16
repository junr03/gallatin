import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../config/mods/sectioned-spaces/main.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/gm, '').replace(/export default class Spaces/, 'globalThis.Spaces = class Spaces')
  .replace(/export function/g, 'function');

function setup(data, spaces = []) {
  const element = () => {
    const node = { children: [], events: {} };
    const proxy = new Proxy(node, { get(target, key) {
      if (key in target) return target[key];
      return (...args) => {
        if (key === 'child') target.children.push(args[0]);
        else if (key === 'children') target.children.push(...args[0]);
        else if (key === 'when') { if (args[0]) args[1](proxy); }
        else if (key.startsWith('on_')) target.events[key] = args.at(-1);
        else if (key === 'id') target.id = args[0];
        return proxy;
      };
    } });
    return proxy;
  };
  const context = vm.createContext({ View: class {}, div: element, svg: element, h_flex: element, v_flex: element,
    shared: () => data, setShared: (_key, value) => { data = value; }, spaces: () => spaces,
    panes: () => [], machines: () => [], props: () => ({}), closeOverlay() {},
    openOverlay: value => { context.overlay = value; } });
  vm.runInContext(source, context);
  const view = new context.Spaces();
  view.row = ({ w }) => w.id;
  return { view, context, data: () => data };
}

function flatten(nodes) {
  return Array.from(nodes).flatMap(node => typeof node === 'object' ? [node, ...flatten(node.children)] : [node]);
}

test('sections appear only on their machine, with unassigned spaces first and no heading', () => {
  const { view } = setup({ sections: [{ id: 's', name: 'Work', machine: 'remote' }], assignments: { assigned: 's' } });
  const rows = [{ w: { id: 'assigned' } }, { w: { id: 'loose' } }];
  assert.deepEqual(flatten(view.sectionRows(rows, {}, null)).filter(x => typeof x === 'string'), ['assigned', 'loose']);
  assert.deepEqual(flatten(view.sectionRows(rows, {}, 'remote')).filter(x => typeof x === 'string'), ['loose', 'Work', '✎', '×', 'assigned']);
});

test('new section saves the machine from its form', () => {
  const { view, data } = setup({ sections: [], assignments: {} });
  view.form = { machine: 'remote' };
  view.input = { value: () => 'Work' };
  view.saveSection({});
  assert.equal(data().sections[0].machine, 'remote');
});


test('machine headings each create sections with their own context, including local-only mode', () => {
  const { view, context } = setup({ sections: [], assignments: {} });
  view.ordered = () => [];
  view.machines = [{ name: 'remote', state: 'connected' }];
  view.reconnecting = {};
  view.folded = new Set();
  const cx = { stop_propagation() {} };
  for (const machine of [null, 'remote']) {
    const button = flatten(view.grouped({}, false)).find(x => x?.id === `section-new-${machine ?? 'local'}`);
    button.events.on_click({}, cx);
    assert.equal(context.overlay.props.sectionForm.machine, machine);
  }
  view.machines = [];
  assert.ok(flatten(view.grouped({}, false)).some(x => x?.id === 'section-new-local'));
});

test('old shared sections split by assigned machines and keep their spaces', () => {
  const { view } = setup({ sections: [{ id: 's', name: 'Work' }], assignments: { a: 's', b: 's' } },
    [{ id: 'a' }, { id: 'b', machine: 'remote' }]);
  const data = view.sectionData();
  assert.equal(data.sections.length, 2);
  for (const [id, machine] of [['a', null], ['b', 'remote']]) {
    assert.equal(data.sections.find(s => s.id === data.assignments[id]).machine, machine);
  }
  assert.equal(view.sectionData(), data);
});
