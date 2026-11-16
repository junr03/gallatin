import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("../config/mods/usage/main.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export default class Usage", "class Usage");

// Herdr's ShellFetchResponse exposes status/ok/url/text/json, without headers.
function harness(status, headers) {
  const context = vm.createContext({
    View: class {},
    exec: async () => ({ code: 0, stdout: JSON.stringify({ claudeAiOauth: { accessToken: "fixture" } }) }),
    home: () => "/fixture",
    readTextFile: async () => JSON.stringify({ tokens: { access_token: "fixture" } }),
    fetch: async () => ({ status, ok: false, ...(headers ? { headers } : {}) }),
  });
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}

for (const service of ["claude", "codex"]) {
  for (const [status, message] of [
    [401, /login expired/],
    [429, /rate limited/],
    [503, /HTTP 503/],
  ]) {
    test(`${service}: HTTP ${status} keeps its error without response headers`, async () => {
      const run = harness(status);
      await run(`poll(shared.${service}, ${service}Live)`);
      assert.match(run(`shared.${service}.live.error`), message);
      assert.equal(run(`shared.${service}.failures`), 1);
      assert.ok(run(`shared.${service}.nextAt > Date.now()`));
    });
  }

  test(`${service}: rate limiting preserves previously loaded windows`, async () => {
    const run = harness(429);
    run(`shared.${service}.live = { windows: [{ label: "Existing", pct: 25 }] }`);
    await run(`poll(shared.${service}, ${service}Live)`);
    assert.equal(run(`shared.${service}.live.windows?.[0].pct`), 25);
  });
}

test("Retry-After is honored when headers are available", async () => {
  const run = harness(429, { get: () => "7200" });
  const before = Date.now();
  await run("poll(shared.claude, claudeLive)");
  assert.ok(run("shared.claude.nextAt") >= before + 7_200_000);
});
