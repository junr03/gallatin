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
    ".codex/AGENTS.md".source = "${codexConfig}/AGENTS.md";
    ".codex/agents".source = "${codexConfig}/agents";
    ".codex/keybindings.json".source = "${codexConfig}/keybindings.json";
    ".codex/rules".source = "${codexConfig}/rules";
  } // lib.mapAttrs' (
    name: _:
    lib.nameValuePair ".codex/skills/${name}" {
      source = "${codexConfig}/skills/${name}";
      recursive = true;
    }
  ) (builtins.readDir "${codexConfig}/skills");
}
```

Merge `config.shared.toml` into each host's `~/.codex/config.toml`. Keep
project-specific trust, notification, plugin, and local tool settings in the
host configuration.
