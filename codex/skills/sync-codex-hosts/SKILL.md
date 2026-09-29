---
name: sync-codex-hosts
description: Synchronize Codex model access between the local desktop and SSH hosts. Use when a new reasoning model appears locally but is missing on devbox or electricpeak, or when asked to update remote Codex packages, restart managed app servers, refresh SSH connections, or verify model parity.
---

# Sync Codex hosts

Use the desktop's bundled Codex as the baseline. Run the bundled Python script from the local Mac. Require Python 3 and working SSH authentication. Do not use a remote shell's Codex version as the local baseline.

## Configure once

Keep machine paths and SSH aliases in an untracked host override such as `~/.config/codex-host-sync.json`. Use [host configuration](references/host-config.md) to configure the actual machines. Do not put machine paths in shared configuration or copy authentication between hosts.

## Audit and apply

1. Run `python3 <skill-directory>/scripts/sync_hosts.py --config <host-config>`.
2. Read the JSON report. Exit 0 means model IDs, reasoning levels, account identity, and minimum daemon version match. Exit 2 means drift. Exit 1 means the audit failed.
3. For a synchronization request, run the same command with `--apply`. Do not ask again for routine update authorization already supplied by the user. Explain that remote connections will briefly reconnect. The script refuses to update when any remote host has active or unknown-status loaded threads. Wait for that work to finish, then retry. Never bypass this check by killing processes.
4. Verify the final report. The script uses `codex app-server daemon update` for older daemons and `daemon restart` for current daemons with catalog drift. It rechecks remote work immediately before mutation and probes the live daemon over its Unix WebSocket control socket afterward. It neither replaces Nix store executables nor changes system profiles. Report any partial update if a later host fails.
5. Verify both desktop SSH connections and model pickers. A healthy control-socket handshake proves daemon connectivity, but does not prove the desktop refreshed its existing connections. Inspect the desktop through available app controls. If its connections remain stale, use the displayed reconnect action for each affected host and check the picker again. Do not delete connections or restart the entire desktop automatically. Do not claim UI parity from the script alone. If no UI control is available, report the exact reconnect step still needed.

## Boundaries and recovery

- Match model access, not just version strings. The native updater selects its release. A remote version newer than the desktop is acceptable only when the visible model catalog and reasoning options match. Report versions explicitly.
- The local probe starts a temporary app-server using the bundled executable and existing local authentication. It cannot emulate desktop-only account/workspace selection or attestation. If its catalog differs from the visible desktop picker, stop and investigate that difference before claiming parity.
- Treat account matching by normalized email as a check, not proof of workspace or rollout eligibility. Never alter accounts or copy credentials to force parity. If catalogs still differ after updating, report remaining model IDs and consider workspace, provider configuration, rollout, or publication lag.
- Require an already-running managed remote daemon. If absent, inspect `daemon bootstrap --help` and `daemon start --help` on that host, explain the required setup, and apply only within the user's authorized scope. Do not create unrelated services.
- Do not print `auth.json`, tokens, raw RPC errors, or runtime logs. The script prints model IDs, versions, account-match booleans, and active-thread counts only.
- Do not remove sockets, caches, sessions, histories, SQLite state, or forwarded SSH agent paths. Diagnose an observed malformed path separately and preserve it with a reversible rename only when authorized.
- Do not install a scheduled updater by default. If the user requests recurring synchronization, use a local Codex automation to invoke this skill, remain quiet when unchanged, defer during active work, and report actionable failures or completed updates.

The managed control socket and `app-server proxy` carry WebSocket traffic, unlike the standalone stdio app-server's newline JSON. Use the socket path reported by `daemon version`.

Use the protocol documented in [OpenAI's app-server reference](https://learn.chatgpt.com/docs/app-server): initialize the connection, paginate `model/list`, and compare `supportedReasoningEfforts`. Recheck installed command help when daemon behavior changes.
