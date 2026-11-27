{
  config,
  lib,
  pkgs,
  ...
}:
let
  tools = with pkgs; [
    curl
    fd
    git
    gnutar
    gzip
    lazygit
    ripgrep
    stdenv.cc
    tree-sitter
    unzip
  ];
in
{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;
    # Load Home Manager's provider setup without generating a second init.lua.
    sideloadInitLua = true;
  };

  home.packages = tools;

  # Recursive links keep the parent directories writable for LazyVim metadata.
  xdg.configFile."nvim" = {
    source = ./config;
    recursive = true;
  };

  # lazy.nvim rewrites its lockfile, so install a writable copy of our shared
  # lock and restore it after the configuration links are in place.
  home.activation.lazyvimPlugins = lib.hm.dag.entryAfter [ "linkGeneration" ] ''
    run install -m 644 ${./lazy-lock.json} ${lib.escapeShellArg "${config.xdg.configHome}/nvim/lazy-lock.json"}
    run install -m 644 ${./lazyvim.json} ${lib.escapeShellArg "${config.xdg.configHome}/nvim/lazyvim.json"}
    run env \
      PATH=${lib.makeBinPath tools}:"$PATH" \
      XDG_CONFIG_HOME=${lib.escapeShellArg config.xdg.configHome} \
      XDG_DATA_HOME=${lib.escapeShellArg config.xdg.dataHome} \
      XDG_STATE_HOME=${lib.escapeShellArg config.xdg.stateHome} \
      XDG_CACHE_HOME=${lib.escapeShellArg config.xdg.cacheHome} \
      GALLATIN_LAZYVIM_LOCKFILE=${./lazy-lock.json} \
      ${config.programs.neovim.finalPackage}/bin/nvim --headless \
      '+Lazy! restore' \
      '+luafile ${./verify-plugins.lua}' +qa
  '';
}
