import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Exercise the actual installer without contacting the user's launchd session.
test('login service waits for shutdown and monitors completion behind other apps', {
  skip: process.platform !== 'darwin',
}, () => {
  const folder = mkdtempSync(join(tmpdir(), 'herdr-micro2-install-'));
  try {
    const preload = join(folder, 'isolate-install.mjs');
    writeFileSync(preload, `
      import os from 'node:os';
      import cp from 'node:child_process';
      import {syncBuiltinESMExports} from 'node:module';
      os.homedir = () => ${JSON.stringify(folder)};
      let unloadPolls = 0;
      cp.execFileSync = (program, args) => {
        if (program === '/usr/bin/which') return args[0] === 'node' ? process.execPath : '/opt/homebrew/bin/herdr-app';
        if (program === '/bin/launchctl') {
          if (args[0] === 'print') {
            if (++unloadPolls < 3) return Buffer.alloc(0);
            throw new Error('Service no longer registered');
          }
          if (args[0] === 'bootstrap' && unloadPolls < 3)
            throw new Error('Previous service is still registered');
          return Buffer.alloc(0);
        }
        if (program === '/usr/bin/plutil') return Buffer.alloc(0);
        throw new Error('Unexpected external command: ' + program);
      };
      syncBuiltinESMExports();
    `);
    execFileSync(process.execPath, ['--import', preload,
      fileURLToPath(new URL('./install.mjs', import.meta.url))], { stdio: 'pipe' });
    const plist = readFileSync(join(folder, 'Library/LaunchAgents/dev.herdr.micro2.plist'), 'utf8');
    const program = plist.match(/<key>ProgramArguments<\/key><array>(.*?)<\/array>/s)?.[1] || '';
    const args = [...program.matchAll(/<string>(.*?)<\/string>/g)].map(match => match[1]);
    assert.ok(args.includes('--background'),
      'The login service must update done/green while Herdr is not foreground');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
