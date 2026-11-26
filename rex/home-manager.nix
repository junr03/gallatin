{ gallatin, ... }:
{
  home.file.".config/rex/init.lua" = {
    force = true;
    source = "${gallatin}/rex/init.lua";
  };
}
