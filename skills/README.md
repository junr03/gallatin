# Shared agent skills

Import this Home Manager module on macOS or Linux to install Gallatin's custom
skills and pinned external skills under `~/.agents/skills`:

```nix
{
  home-manager.users.yourUser.imports = [ "${gallatin}/skills" ];
}
```

The enclosing NixOS or nix-darwin module needs `gallatin` as an argument. Pin its
source revision in your flake input and regenerate the lock file when updating it.

`repositories.nix` is the shared source list. It includes `codex/skills` from
Gallatin and the pinned Matt Pocock repository. Add repositories there and pin
external sources to a Git revision. The installer searches `.agents/skills/` and
`skills/` by default. Set `directories` to choose other roots.

`inventory.nix` discovers the complete skill set and rejects duplicate directory
names across all sources. Each directory containing `SKILL.md` becomes one entry
named after that directory. Discovery stops at the manifest, so supporting files
and subdirectories stay with the skill. When a search root itself contains
`SKILL.md`, its entry uses the repository name. Missing roots are skipped.

The Home Manager module installs individual links from this inventory using
normal collision checks. `package.nix` exposes the same inventory as a Nix
package for consumers that need stable store paths. `codex.nix` uses that package
for its agents' skill references and keeps `$out/skills` as a compatibility link.
It does not need a separate installation of skills into `~/.codex/skills`.

If you used the old `codex/README.md` example, replace its
`.codex/skills/<name>` Home Manager entries with the shared module import. Home
Manager will retire those previously managed links on activation. Unmanaged
skill directories and Codex runtime files are left in place. Resolve any
collision at the new destination before activation.

Run discovery, package, and Codex agent-reference checks from the repository root:

```sh
nix-build --no-out-link -E 'with import <nixpkgs> {}; callPackage ./skills/tests {}'
```
