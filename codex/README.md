# Shared Codex configuration

`codex.nix` packages the user-owned parts of `~/.codex` that can be shared by
the Electricpeak and Blacktail configurations.

The output contains:

- `AGENTS.md`
- `agents/`
- `skills/`, a compatibility link to the shared agent skill package
- `rules/`
- `keybindings.json`
- `config.shared.toml`, a portable fragment for the host's `config.toml`

The package does not include authentication, histories, sessions, caches,
memories, SQLite databases, plugin caches, project trust entries, desktop
settings, local executable paths, or OAuth state.

## Home Manager

Use the package from either host configuration and import Gallatin's shared
skill installer. The installer places custom and external skills in
`~/.agents/skills`. The Codex package keeps agents, rules, instructions, and
settings separate from the runtime directory:

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

The `force` settings apply to the listed Codex configuration paths. The shared
skill installer uses normal Home Manager collision checks. Neither replaces the
whole `~/.codex` directory or its runtime state.

Remove the `.codex/skills/<name>` declarations from the previous example when
adopting this module. Home Manager retires previously managed links on
activation. The package's `$out/skills` link and the generated agents' absolute
skill references remain valid. See [the shared skill module](../skills/README.md)
for source pins, duplicate-name checks, and migration details.

Merge `config.shared.toml` into each host's `~/.codex/config.toml`. Keep
project-specific trust, notification, plugin, and local tool settings in the
host configuration.
