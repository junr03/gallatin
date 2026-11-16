// Install this checkout as a per-user macOS service. No elevated privileges needed.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

if (process.platform !== 'darwin') throw new Error('Requires macOS');
const label = 'dev.herdr.micro2';
const domain = `gui/${process.getuid()}`;
const folder = join(homedir(), 'Library/LaunchAgents');
const plist = join(folder, `${label}.plist`);
async function unload() {
  try { execFileSync('/bin/launchctl', ['bootout', `${domain}/${label}`], { stdio: 'pipe' }); }
  catch (error) {
    // bootout also fails if it is not loaded. bootstrap below reports real install errors.
  }
  // bootout can return before launchd finishes removing a SIGTERMed service.
  // Bootstrapping during that interval fails with "Input/output error".
  for (let attempt = 0; attempt < 100; attempt++) {
    try { execFileSync('/bin/launchctl', ['print', `${domain}/${label}`], { stdio: 'pipe' }); }
    catch { return; }
    await delay(100);
  }
  throw new Error('Previous Herdr Micro 2 service has not stopped; retry installation.');
}
if (process.argv.includes('--uninstall')) {
  await unload();
  rmSync(plist, { force: true });
  console.log('Removed Herdr Micro 2 login service. The checkout is unchanged.');
} else {
  const which = name => execFileSync('/usr/bin/which', [name], { encoding: 'utf8' }).trim();
  const node = which('node');
  const herdr = which('herdr-app');
  const bridge = join(dirname(fileURLToPath(import.meta.url)), 'bridge.mjs');
  const logs = join(homedir(), 'Library/Logs/HerdrMicro2');
  mkdirSync(folder, { recursive: true });
  mkdirSync(logs, { recursive: true });
  const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const environment = { PATH: process.env.PATH, HERDR_APP_BIN: herdr };
  if (process.env.HERDR_APP_HOME) environment.HERDR_APP_HOME = process.env.HERDR_APP_HOME;
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(bridge)}</string><string>--background</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>EnvironmentVariables</key><dict>${Object.entries(environment).map(([k,v]) => `<key>${k}</key><string>${xml(v)}</string>`).join('')}</dict>
<key>StandardOutPath</key><string>${xml(join(logs, 'bridge.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logs, 'bridge.error.log'))}</string>
</dict></plist>\n`;
  await unload();
  writeFileSync(plist, text);
  execFileSync('/usr/bin/plutil', ['-lint', plist], { stdio: 'inherit' });
  execFileSync('/bin/launchctl', ['bootstrap', domain, plist], { stdio: 'inherit' });
  console.log(`Installed ${label}. Logs: ${logs}`);
}
