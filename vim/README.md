# Editor module compatibility

`home-manager.nix` now imports the shared [LazyVim module](../neovim/README.md).
Existing imports continue to work, but install Neovim with LazyVim instead of
Vim. New consumers should import `neovim/home-manager.nix` directly.
