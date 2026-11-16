# Shared Herdr configuration

`herdr.nix` packages the portable, user-owned parts of the local Herdr setup.
The Home Manager module overlays those files into `~/.config/herdr-app` while
leaving unrelated files and runtime state alone.

The package contains:

- `settings.json` and `keys.json`
- the custom `projects` and `sections` layouts
- the custom `projects`, `project-tabs`, `sectioned-spaces`, `usage`, `workspace-chrome`, and `worktree`
  mods

Herdr-managed layouts and mods, generated type files and instructions, window
and project state, shared mod data, update notes, and downloaded metadata stay
outside the package. Herdr rewrites its `AGENTS.md` at startup, so the durable
agent instructions for this configuration live in Gallatin's shared
`codex/AGENTS.md` instead.

The `usage` mod shows Claude Code and Codex plan limits as progress bars. Its
lookup uses the existing local Claude and Codex login credentials to make
HTTPS requests to Anthropic and ChatGPT usage endpoints. The package contains
no credentials. Each service is asked at most every five minutes, and failures back off
up to an hour, so the usage endpoints do not rate-limit the app. Claude's Keychain lookup
is macOS-specific; the local login must exist on each machine for its limits to appear.

## Sections layout

Select **sections** in Herdr's layout picker to use the standard Herdr window
with a sectioned Spaces pane and the Usage pane below Agents. Use the section button beside Spaces to create
named sections; use the pencil or × on a section to rename or delete it.
Drag a space onto a section heading or another space to move it. Deleting a
section puts its spaces in Unassigned. Sections and assignments are saved in
Herdr's shared mod state; they are not part of this package. On multiple
machines, the same section headings appear under each machine. Expand the
sidebar to manage sections.

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

The activation copies only paths present in the package into
`~/.config/herdr-app`, replacing them with the selected Gallatin revision. Keep local experiments
until they are ready, then port the final changes into `herdr/config` and open a pull request to Gallatin
before activating a revision that replaces them.

## Creator Micro 2

The optional [Micro 2 bridge](micro2/README.md) maps six stable Herdr agents to
the keyboard's existing agent keys, with live status colors and press-to-focus.
It runs separately from the layout/config package and includes a per-user macOS
login-service installer.
