# Shared Codex configuration

`codex.nix` packages the user-owned parts of `~/.codex` that can be shared by
the Electricpeak and Blacktail configurations.

The output contains:

- `AGENTS.md`
- `agents/`
- `rules/`
- `keybindings.json`
- `config.shared.toml`, a portable fragment for the host's `config.toml`

The package does not include authentication, histories, sessions, caches,
memories, SQLite databases, plugin caches, project trust entries, desktop
settings, local executable paths, or OAuth state.

## Home Manager

Use the package from either host configuration and keep the existing Codex
runtime directory in place. Import Gallatin's separate Home Manager skill module
to install the pinned Matt Pocock skills under `~/.agents/skills`:

```nix
let
  codexConfig = pkgs.callPackage "${gallatin}/codex.nix" { };
in
{
  imports = [ "${gallatin}/skills" ];

  home.file = {
    ".codex/AGENTS.md" = {
      source = "${codexConfig}/AGENTS.md";
      force = true;
    };
    ".codex/agents" = {
      source = "${codexConfig}/agents";
      force = true;
    };
    ".codex/keybindings.json" = {
      source = "${codexConfig}/keybindings.json";
      force = true;
    };
    ".codex/rules" = {
      source = "${codexConfig}/rules";
      force = true;
    };
  };
}
```

The `force` settings apply to the listed Codex configuration paths. The skill
module uses normal Home Manager collision checks. Neither replaces the whole
`~/.codex` directory or its runtime state.

The six custom skills formerly under `codex/skills/` have been removed. They
remain recoverable from Git history. `codex.nix` no longer exports a `skills/`
directory, and the packaged agents no longer reference those skills.

If you used the old example, remove its `.codex/skills/<name>` declarations when
updating. Home Manager retires previously managed links on activation. Unmanaged
files are left in place. See [the skill module](../skills/README.md) for the
external source pin and installation behavior.

Merge `config.shared.toml` into each host's `~/.codex/config.toml`. Keep
project-specific trust, notification, plugin, and local tool settings in the
host configuration.
