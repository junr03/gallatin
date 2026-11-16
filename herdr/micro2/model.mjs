const colors = {
  working: { c: 0x0060ff, e: 4, s: 0.55 },
  blocked: { c: 0xff6a00, e: 4, s: 0.35 },
  done: { c: 0x00ff30, e: 1, s: 0.5 },
  idle: { c: 0x101010, e: 1, s: 0.5 },
};

// Use the app's machine-qualified addresses, including for remote sub-agents.
export function agentsFrom(snapshot) {
  if (!Array.isArray(snapshot.spaces)) throw new Error('Invalid Herdr snapshot');
  const agents = [];
  function visit(terminal, space) {
    const address = terminal.terminal || terminal.address;
    if (address && Object.hasOwn(colors, terminal.status)) agents.push({
      address,
      status: terminal.status,
      label: terminal.name || `${space.name} · ${terminal.app || terminal.terminal}`,
    });
    for (const child of terminal.sub_agents || []) visit(child, space);
  }
  for (const space of snapshot.spaces)
    for (const tab of space.tabs || [])
      for (const terminal of tab.terminals || []) visit(terminal, space);
  return agents;
}

export function assignSlots(previous, agents) {
  const live = new Map(agents.map(a => [a.address, a]));
  const slots = Array.from({ length: 6 }, (_, i) => live.get(previous[i]?.address) || null);
  const assigned = new Set(slots.filter(Boolean).map(a => a.address));
  for (const agent of agents) {
    if (assigned.has(agent.address)) continue;
    const index = slots.indexOf(null);
    if (index < 0) break;
    slots[index] = agent;
    assigned.add(agent.address);
  }
  return slots;
}

export function lighting(slots) {
  return slots.map((agent, id) => ({
    id, b: 1, ...(agent ? colors[agent.status] : { c: 0, e: 0, s: 0.5 }),
  }));
}

export function pressedSlot(message) {
  if (message.m !== 'v.oai.hid' || message.p?.act !== 1) return null;
  const match = /^AG0([0-5])$/.exec(message.p.k);
  return match ? Number(match[1]) : null;
}
