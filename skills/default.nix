{ lib, ... }:
let
  inventory = import ./inventory.nix { inherit lib; };
in
{
  home.file = lib.mapAttrs' (
    name: source: lib.nameValuePair ".agents/skills/${name}" { inherit source; }
  ) inventory;
}
