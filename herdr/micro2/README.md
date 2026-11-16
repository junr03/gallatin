# Creator Micro 2 agent keys for Herdr

The first six agent keys show six Herdr agents and focus their terminals when
pressed. Local and remote agents work through `herdr-app ls` and `agent.focus`.
The bridge uses the stock firmware's vendor HID interface, based on the protocol
investigation in [AgentKeys](https://github.com/okko/micro2-agent-keys).
It never writes firmware, profiles, keymaps, or ambient lighting.

| Light | Herdr state |
| --- | --- |
| Breathing blue | Working |
| Breathing amber | Blocked, waiting for you |
| Green | Done, unread |
| Dim white | Idle |
| Off | Unassigned |

Assignments follow Herdr's space/tab/terminal order on startup, then remain
stable even when statuses or sidebar order change. Ending an agent frees its
slot for the next unassigned agent. Extra agents wait for an available slot.
Restarting the bridge assigns slots afresh. Pressing a done agent acknowledges
it through Herdr normally, so green becomes idle once Herdr marks it seen.

## Setup

Requires macOS, Node.js 20+, Herdr, and a Creator Micro 2 over USB. The six keys
must already be mapped to `KV_OAI_AG00` through `KV_OAI_AG05` in Work Louder Input
(the existing ChatGPT agent layer works).

From this directory:

```sh
npm ci --ignore-scripts
npm test
node bridge.mjs --inspect   # preview initial slot assignments without opening USB
npm start                  # foreground service; Ctrl+C stops it
```

Focus Herdr to activate the bridge. By default it only holds the keyboard while
Herdr is the foreground app; switching away closes its HID connection and stops
sending colors or handling presses. Last colors may remain until another app
updates them. This makes it possible to switch back to the ChatGPT integration.
Both applications' hardware behavior should be checked before relying on that
handoff; the protocol has no documented ownership arbitration.

For continuous monitoring and keys that bring Herdr forward from other apps:

```sh
node bridge.mjs --background
```

Use background mode with the other agent-key integration stopped, because both
apps can otherwise write the same six status lights. Quit background mode before
using ChatGPT's agent keys again. Input can continue providing ordinary macros;
avoid changing device profiles while the bridge is writing status.

If macOS denies USB access, allow the launching terminal/Node process under
System Settings → Privacy & Security → Input Monitoring, then restart it.
The bridge reports missing/disconnected hardware and retries automatically.
Herdr becoming unavailable clears its assignments and lights, then retries.

## Start at login

Stop a manually running bridge first, then run:

```sh
node install.mjs
```

This installs `~/Library/LaunchAgents/dev.herdr.micro2.plist` in the current
user's GUI session. It runs the default foreground-app mode, using this checkout,
the current `node` command path, and the detected `herdr-app` path. Keep the
checkout and its installed dependencies in place. After moving it or changing
Node/Herdr paths, rerun the installer. Logs are in
`~/Library/Logs/HerdrMicro2/`; reinstalling restarts the service.

```sh
node install.mjs --uninstall
```

Uninstalling stops the service and removes its plist. It leaves the checkout,
dependencies, and logs in place. A process lock under
`~/.local/state/herdr-micro2/` prevents duplicate bridge processes; dead process
locks recover automatically on the next start.

`HERDR_APP_HOME` selects a nondefault Herdr window; `HERDR_APP_BIN` overrides the
CLI executable when running manually. No credentials or transcripts are read.
The bridge is deliberately separate from the copied `herdr/config` package:
it needs Node and its native HID dependency, not a Herdr layout or mod reload.

## Verification

`npm test` checks stable assignment, slot turnover and overflow, remote addresses,
state colors, key-down filtering, HID framing, reply handling, and USB errors.
`--inspect` verifies real Herdr data without writing to the device. Physical
light appearance, key navigation, and switching between Herdr and ChatGPT
require the connected keyboard.
