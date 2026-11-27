# Shared LazyVim configuration

Gallatin contains the full [LazyVim starter](https://github.com/LazyVim/starter)
at commit `803bc181d7c0d6d5eeba9274d9be49b287294d99`. All tracked starter files
are included unchanged under `config/`, including options, keymaps, autocmds,
the disabled plugin examples, editor tooling configuration, and license.
No optional extras or personal mappings are enabled.

## Install on both hosts

Import this module into each host's Home Manager user and pin both hosts to
the same Gallatin revision:

```nix
home-manager.users.junr03.imports = [
  "${inputs.gallatin}/neovim/home-manager.nix"
];
```

The old `vim/home-manager.nix` import forwards to this module. Remove any
host-local `programs.vim` configuration. Gallatin no longer enables Vim or
installs its former plugins and mappings. Neovim becomes the default editor,
and `vi` and `vim` launch Neovim.

Home Manager links the complete starter configuration, installs writable
copies of the shared `lazy-lock.json` and `lazyvim.json`, and runs
`nvim --headless '+Lazy! restore'` to install or restore the locked plugins.
Activation requires network access and verifies that installed plugin commits
match Gallatin's lockfile. The Lua files remain read-only; the lockfile and
extras selection remain writable for LazyVim's normal commands.

Existing unmanaged files that collide with starter files must be moved aside
before activation. Existing plugin downloads and caches are retained.
Activation replaces local lockfile and extras selections with Gallatin's
copies, so save experiments you want to keep before activating again.

Use a host package set with Neovim 0.11.2 or newer and configure a Nerd Font
in the terminal for icons. The module includes Git, curl, fd, ripgrep,
lazygit, tree-sitter, a C compiler, tar, gzip, and unzip. Language servers,
formatters, and parser builds use LazyVim's normal runtime workflow; their
binaries are not pinned by the plugin lockfile. NixOS may need host-managed
packages for tools that require system libraries.

## Configure once in Gallatin

Edit these files, submit a Gallatin PR, then update both hosts to its revision
and activate Home Manager:

- `config/lua/config/options.lua`: editor options.
- `config/lua/config/keymaps.lua`: key mappings.
- `config/lua/config/autocmds.lua`: autocommands.
- `config/lua/plugins/*.lua`: plugins and overrides. The starter's `example.lua`
  remains disabled until you deliberately enable or replace it.
- `lazyvim.json`: shared optional extras selection.
- `lazy-lock.json`: shared plugin commits.

You can experiment with `:LazyExtras` and `:Lazy update`. To keep the results,
copy `~/.config/nvim/lazyvim.json` and `~/.config/nvim/lazy-lock.json` back to
this directory, review the diff, and commit them. These paths assume the
default XDG configuration directory. Both hosts then restore those choices
on their next activation. Reopen Neovim after activation if it was running.

Run `:LazyHealth` for interactive health checks. Space is the starter's
leader; see the [LazyVim keymaps](https://www.lazyvim.org/keymaps).
