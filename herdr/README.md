# Shared Herdr configuration

`herdr.nix` packages the portable, user-owned parts of the local Herdr setup.
The Home Manager module overlays those files into `~/.config/herdr-app` while
leaving unrelated files and runtime state alone.

The package contains:

- `settings.json` and `keys.json`
- the custom `projects` layout
- the custom `projects`, `project-tabs`, `usage`, `workspace-chrome`, and `worktree`
  mods

Herdr-managed layouts and mods, generated type files and instructions, window
and project state, shared mod data, update notes, and downloaded metadata stay
outside the package. Herdr rewrites its `AGENTS.md` at startup, so the durable
agent instructions for this configuration live in Gallatin's shared
`codex/AGENTS.md` instead.

The `usage` mod reads local Claude and Codex transcript files. Its live-limit
lookup uses the existing local Claude and Codex login credentials to make
HTTPS requests to Anthropic and ChatGPT usage endpoints. The package contains
no credentials. Claude's Keychain lookup is macOS-specific; the local token
and transcript files must exist on each machine for the corresponding data to
appear.

## Home Manager

Import `herdr/home-manager.nix` into a Home Manager user and pass the Gallatin
source as the `gallatin` module argument. Add it to each host user's imports;
the example uses Electricpeak's `junr03` user:

```nix
home-manager.extraSpecialArgs.gallatin = inputs.gallatin;
home-manager.users.junr03.imports = [
  "${inputs.gallatin}/herdr/home-manager.nix"
];
```

The overlay manages only paths present in the package. It uses
`force = true`, so a Home Manager activation restores those paths from the
selected Gallatin revision. Keep local experiments until they are ready, then
port the final changes into `herdr/config` and open a pull request to Gallatin
before activating a revision that replaces them.
