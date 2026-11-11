{ gallatin, pkgs, ... }:
let
  herdrConfig = pkgs.callPackage "${gallatin}/herdr.nix" { };
in
{
  home.file.".config/herdr-app" = {
    source = herdrConfig;
    recursive = true;
    force = true;
  };
}
