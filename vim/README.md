# Shared Vim configuration

`home-manager.nix` owns the shared Vim plugins, settings, and key mappings.
It enables Vim with Airline, Startify, and tmux navigation support.

Import it into a Home Manager user, alongside modules such as
`herdr/home-manager.nix`:

```nix
home-manager.users.junr03.imports = [
  "${inputs.gallatin}/vim/home-manager.nix"
];
```

This module only needs Home Manager's `pkgs` argument; it does not require
`gallatin` in `extraSpecialArgs`.

Opening a directory, such as `vim .`, shows Vim's built-in netrw browser in
tree mode on the left, using 25% of the window width. Selected files open in
the editing window. Opening a file directly keeps the usual single window.

- `,e`: toggle the file tree.
- `Ctrl-h`, `Ctrl-j`, `Ctrl-k`, `Ctrl-l`: move between windows.
- `Tab` / `Shift-Tab`: switch buffers.

This configuration is extracted from Blacktail's Vim module, including its
directory tree setup. After merging this into Gallatin, consumers can pin the
merged revision and replace their local Vim configuration with the import
above.
