# Shared LazyVim configuration

Import this module into a Home Manager user:

```nix
home-manager.users.junr03.imports = [
  "${inputs.gallatin}/neovim/home-manager.nix"
];
```

The previous `vim/home-manager.nix` path forwards to this module. Remove any
host-local `programs.vim` configuration when migrating. Gallatin no longer
enables Vim or installs its old plugins and mappings.

The module installs Neovim, sets it as the default editor, and provides `vi`
and `vim` aliases. It includes Git, curl, fd, ripgrep, lazygit, tree-sitter,
a C compiler, and unzip. Use a host package set with Neovim 0.11.2 or newer,
as required by [LazyVim](https://www.lazyvim.org/). Configure a Nerd Font in
your terminal for icons.

After updating the host's Gallatin input and activating Home Manager, run
`nvim`. The first launch needs network access to download lazy.nvim, LazyVim,
and its plugins. Run `:LazyHealth` afterward to check the installation.
Language servers and formatters use LazyVim's normal Mason workflow; on
NixOS, tools that require system libraries may need host-managed packages.

Home Manager owns only `init.lua` and `lua/config/lazy.lua`. Existing files at
those paths must be moved aside before activation if Home Manager does not
already manage them. Plugin downloads, LazyVim extras metadata, caches, and
the writable lockfile (`stdpath("state")/lazy-lock.json`) stay outside the
Nix store. Plugin versions follow LazyVim's upstream defaults and are locked
per host, rather than pinned by Gallatin.

The old comma-leader mappings are replaced by LazyVim defaults: Space is the
leader, `Space e` opens the explorer, and `Space` opens keybinding hints.
See the [LazyVim keymaps](https://www.lazyvim.org/keymaps) for the full set.
