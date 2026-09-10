{
  description = "Reusable Nix host modules for Gallatin-managed GitHub Actions runners";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nix-darwin.url = "github:LnL7/nix-darwin";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-darwin"
      ];
      forAllSystems =
        function: nixpkgs.lib.genAttrs systems (system: function (import nixpkgs { inherit system; }));
    in
    {
      packages = forAllSystems (pkgs: {
        github-actions-runner = pkgs.callPackage ./github-actions-runner.nix { };
      });

      nixosModules.github-actions-runner = import ./nixos-github-runner.nix;
      darwinModules.github-actions-runner = import ./darwin-github-runner.nix;
    };
}
