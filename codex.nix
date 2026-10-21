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
    cp -R codex/skills "$out/skills"
    install -m 0644 codex/AGENTS.md "$out/AGENTS.md"
    install -m 0644 codex/config.shared.toml "$out/config.shared.toml"
    install -m 0644 codex/keybindings.json "$out/keybindings.json"

    for agent in "$out"/agents/*.toml; do
      if grep -qF '@CODEX_SKILLS_DIR@' "$agent"; then
        substituteInPlace "$agent" \
          --replace-fail '@CODEX_SKILLS_DIR@' "$out/skills"
      fi
    done

    runHook postInstall
  '';

  meta = {
    description = "Shareable Codex skills, agents, instructions, and rules";
    homepage = "https://github.com/junr03/gallatin";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
