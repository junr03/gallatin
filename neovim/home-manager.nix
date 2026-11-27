{ pkgs, ... }:
{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;
  };

  home.packages = with pkgs; [
    curl
    fd
    git
    lazygit
    ripgrep
    stdenv.cc
    tree-sitter
    unzip
  ];

  # Link individual files so LazyVim can write lazyvim.json in this directory.
  xdg.configFile = {
    "nvim/init.lua".source = ./config/init.lua;
    "nvim/lua/config/lazy.lua".source = ./config/lua/config/lazy.lua;
  };
}
