{ lib, linkFarm }:
let
  inventory = import ./inventory.nix { inherit lib; };
in
linkFarm "agent-skills" (lib.mapAttrsToList (name: path: { inherit name path; }) inventory)
