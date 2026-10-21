# Shared agent skills

Import this Home Manager module on macOS or Linux to install the shared skill
list under `~/.agents/skills`. The list currently contains only the pinned Matt
Pocock skills. Gallatin's Codex configuration package does not bundle skills:

```nix
{
  home-manager.users.yourUser.imports = [ "${gallatin}/skills" ];
}
```

The enclosing NixOS or nix-darwin module needs `gallatin` as an argument. Pin its
source revision in your flake input and regenerate the lock file when updating it.

List any number of named skill repositories in `repositories.nix`. Each entry
has its own pinned `source` and optional `directories`. The installer combines
skills from all entries. Pin each external source to a Git revision.
The installer searches `.agents/skills/` and `skills/` by default. Set
`directories` on a repository to choose other roots.

Each directory containing `SKILL.md` becomes one link named after that directory.
Discovery stops at the manifest, so supporting files and subdirectories stay with
the skill. When a search root itself contains `SKILL.md`, its link uses the
repository name. Missing roots are skipped. Duplicate link names fail evaluation.

The module manages individual skill links. Home Manager's normal collision
checks apply to existing files.

Run the discovery and pinned-source checks from the repository root:

```sh
nix-build --no-out-link -E 'with import <nixpkgs> {}; callPackage ./skills/tests {}'
```
