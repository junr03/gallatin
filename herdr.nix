{
  lib,
  stdenvNoCC,
}:

stdenvNoCC.mkDerivation {
  pname = "herdr-user-config";
  version = "0.1.0";

  src = ./herdr/config;

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out"
    cp -R . "$out/"

    runHook postInstall
  '';

  meta = {
    description = "Portable user-owned Herdr layouts, mods, and settings";
    homepage = "https://github.com/junr03/gallatin";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
