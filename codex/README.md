# Shared Codex configuration

`codex.nix` packages the user-owned parts of `~/.codex` that can be shared by
the Electricpeak and Blacktail configurations.

The output contains:

- `AGENTS.md`
- `agents/`
- `skills/` (custom skills only; Codex's `.system` skills are not copied)
- `rules/`
- `keybindings.json`
- `config.shared.toml`, a portable fragment for the host's `config.toml`

The package does not include authentication, histories, sessions, caches,
memories, SQLite databases, plugin caches, project trust entries, desktop
settings, local executable paths, or OAuth state.

## Home Manager

Use the package from either host configuration and keep the existing Codex
runtime directory in place:

```nix
let
  codexConfig = pkgs.callPackage "${gallatin}/codex.nix" { };
in
{
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
  } // lib.mapAttrs' (
    name: _:
    lib.nameValuePair ".codex/skills/${name}" {
      source = "${codexConfig}/skills/${name}";
      recursive = true;
      force = true;
    }
  ) (builtins.readDir "${codexConfig}/skills");
}
```

The `force` settings replace existing managed files and directories. They do
not replace unrelated files under `~/.codex`, including runtime state.

Merge `config.shared.toml` into each host's `~/.codex/config.toml`. Keep
project-specific trust, notification, plugin, and local tool settings in the
host configuration.
