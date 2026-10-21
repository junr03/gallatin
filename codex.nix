{
  lib,
  stdenvNoCC,
}:

stdenvNoCC.mkDerivation {
  pname = "codex-shared-config";
  version = "0.1.0";

  src = ./.;

  dontBuild = true;

  installPhase = ''
    runHook preInstall

    install -d "$out"
    cp -R codex/agents "$out/agents"
    cp -R codex/rules "$out/rules"
    install -m 0644 codex/AGENTS.md "$out/AGENTS.md"
    install -m 0644 codex/config.shared.toml "$out/config.shared.toml"
    install -m 0644 codex/keybindings.json "$out/keybindings.json"

    runHook postInstall
  '';

  meta = {
    description = "Shareable Codex agents, instructions, and rules";
    homepage = "https://github.com/junr03/gallatin";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
