import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, mkdir, unlink, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Keyboard } from './hid.mjs';
import { agentsFrom, assignSlots, lighting, pressedSlot } from './model.mjs';

const execute = promisify(execFile);
const cli = process.env.HERDR_APP_BIN || 'herdr-app';
async function command(program, args) {
  return (await execute(program, args, { timeout: 4000, maxBuffer: 1024 * 1024 })).stdout;
}
async function snapshot() { return JSON.parse(await command(cli, ['ls'])); }
async function foreground() {
  return (await command('/usr/bin/osascript', ['-l', 'JavaScript', '-e',
    'ObjC.import("AppKit"); var a = $.NSWorkspace.sharedWorkspace.frontmostApplication; a.isNil() ? "" : a.bundleIdentifier.js',
  ])).trim();
}

if (process.argv.includes('--inspect')) {
  console.log(JSON.stringify(assignSlots([], agentsFrom(await snapshot())), null, 2));
  process.exit(0);
}
if (process.platform !== 'darwin') throw new Error('The Micro 2 bridge currently supports macOS');

// An exclusive create prevents two copies of this bridge from driving the HID endpoint.
// Recover a dead owner after a crash/reboot, leaving fresh incomplete locks alone.
const state = join(homedir(), '.local/state/herdr-micro2');
await mkdir(state, { recursive: true });
const lockPath = join(state, 'device.lock');
async function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(await readFile(lockPath, 'utf8'));
      if (Number.isInteger(owner) && owner > 0) {
        try { process.kill(owner, 0); throw new Error(`Bridge already running (PID ${owner})`); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      } else if (Date.now() - (await stat(lockPath)).mtimeMs < 30000) {
        throw new Error('Another bridge is acquiring the device lock');
      }
      await unlink(lockPath);
    }
  }
  throw new Error('Could not acquire device lock');
}
const lock = await acquireLock();
await lock.writeFile(String(process.pid));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { stopping = true; });
let keyboard = null;
let slots = Array(6).fill(null);
let lastPaint = '';
let lastError = '';
let lastRefresh = 0;
const background = process.argv.includes('--background');

async function release(clear = false) {
  const current = keyboard;
  keyboard = null;
  lastPaint = '';
  if (!current) return;
  try { if (clear) await current.show(lighting(Array(6).fill(null))); }
  finally { await current.close(); }
}
async function press(message) {
  const index = pressedSlot(message);
  const agent = slots[index];
  if (index === null || !agent || stopping || !keyboard) return;
  // Check at the press too, so an app switch between polls cannot focus Herdr.
  if (!background && await foreground() !== 'dev.herdr.app') return;
  await command(cli, ['do', 'agent.focus', JSON.stringify({ terminal: agent.address })]);
  if (background) await command('/usr/bin/open', ['-b', 'dev.herdr.app']);
}

console.log('Herdr Micro 2: six stable agent slots; Ctrl+C to stop.');
try {
  while (!stopping) {
    try {
      if (!background && await foreground() !== 'dev.herdr.app') {
        await release();
      } else {
        slots = assignSlots(slots, agentsFrom(await snapshot()));
        if (!keyboard) keyboard = await Keyboard.open(message => {
          press(message).catch(error => console.error('Focus failed:', error.message));
        });
        const threads = lighting(slots);
        const paint = JSON.stringify(threads);
        // Refresh occasionally in case the device reset without disconnecting.
        if (paint !== lastPaint || Date.now() - lastRefresh > 10000) {
          await keyboard.show(threads);
          lastPaint = paint;
          lastRefresh = Date.now();
          console.log(slots.map((a, i) => `${i + 1}: ${a ? `${a.address} ${a.status}` : 'free'}`).join(' | '));
        }
      }
      lastError = '';
    } catch (error) {
      if (error.message !== lastError) console.error(error.message);
      lastError = error.message;
      slots = Array(6).fill(null);
      await release(true).catch(() => {});
      await delay(2000);
    }
    await delay(750);
  }
} finally {
  await release(true).catch(() => {});
  await lock.close();
  await unlink(lockPath);
}
