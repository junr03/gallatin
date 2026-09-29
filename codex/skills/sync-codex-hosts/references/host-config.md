# Host overrides

Create an untracked JSON file on the Mac. Keep its location outside the portable skill package. The script detects standard ChatGPT and Codex app bundles under `/Applications`. Set `local_binary` when the running app uses another location.

```json
{
  "local_binary": "/path/to/running/app/bundled/codex",
  "hosts": [
    {"ssh": "devbox", "binary": "/path/to/user/codex"},
    {"ssh": "electricpeak.net", "binary": "/path/to/system/codex", "python": "python3"}
  ]
}
```

Omit `local_binary` to use app bundle detection. Omit a host's `binary` to resolve `codex` from its Bash login shell. SSH aliases must already exist in your SSH configuration. Do not include passwords or keys.

On NixOS, the system CLI can launch a user-managed daemon even when that daemon's reported standalone path does not yet exist. Use the CLI's native daemon updater and verify `appServerVersion`, rather than overwriting a Nix store executable or treating `managedCodexVersion: null` as proof that the daemon is stopped.

The update may drop existing proxy connections. The script opens a fresh Unix WebSocket connection after the update and checks the running daemon. The desktop should reconnect, but verify its connection and model picker separately.
