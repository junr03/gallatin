# Rex configuration

`init.lua` is the durable source for the Rex keybindings. The Home Manager
module links it to `~/.config/rex/init.lua`, so the Gallatin revision selected
by the host's Nix configuration controls what Rex loads.

Import the module into a Home Manager user and pass Gallatin as a module
argument, as with the other Gallatin modules:

```nix
home-manager.extraSpecialArgs.gallatin = inputs.gallatin;
home-manager.users.junr03.imports = [
  "${inputs.gallatin}/rex/home-manager.nix"
];
```

The module manages only `~/.config/rex/init.lua`. On activation, it replaces an
existing file at that path so Home Manager can take ownership of the Rex
configuration.
