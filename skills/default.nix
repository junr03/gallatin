{ lib, ... }:
{
  home.file = import ./skill-files.nix {
    inherit lib;
    repositories = import ./repositories.nix;
  };
}
