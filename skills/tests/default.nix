{ lib, pkgs }:
let
  discover = repositories: import ../skill-files.nix { inherit lib repositories; };
  defaultFiles = discover { fixture.source = ./fixtures; };
  multipleFiles = discover {
    first = {
      source = ./fixtures;
      directories = [ "skills" ];
    };
    second = {
      source = ./fixtures;
      directories = [ ".agents/skills" ];
    };
  };
  customFiles = discover {
    fixture = {
      source = ./fixtures;
      directories = [ "custom" ];
    };
  };
  missingFiles = discover {
    fixture = {
      source = ./fixtures;
      directories = [ "missing" ];
    };
  };
  duplicateFiles = builtins.tryEval (discover {
    first.source = ./fixtures;
    second.source = ./fixtures;
  });
  repeatedFiles = builtins.tryEval (discover {
    fixture = {
      source = ./fixtures;
      directories = [
        "skills"
        "skills"
      ];
    };
  });
  sharedFiles = (import ../default.nix { inherit lib; }).home.file;
  codexConfig = pkgs.callPackage ../../codex.nix { };
in
assert
  builtins.attrNames defaultFiles == [
    ".agents/skills/agent"
    ".agents/skills/example"
  ];
assert defaultFiles.".agents/skills/example".source == ./fixtures/skills/nested/example;
assert
  builtins.attrNames multipleFiles == [
    ".agents/skills/agent"
    ".agents/skills/example"
  ];
assert builtins.attrNames customFiles == [ ".agents/skills/fixture" ];
assert missingFiles == { };
assert !duplicateFiles.success;
assert !repeatedFiles.success;
assert sharedFiles != { };
assert lib.all (file: builtins.pathExists (file.source + "/SKILL.md")) (
  builtins.attrValues sharedFiles
);
pkgs.runCommand "shared-agent-skills-check"
  {
    nativeBuildInputs = [ pkgs.python3 ];
    inherit codexConfig;
  }
  ''
    python3 - <<'PYTEST'
    import os
    from pathlib import Path
    import tomllib

    codex = Path(os.environ["codexConfig"])
    assert "skills" not in {path.name for path in codex.iterdir()}
    for agent in (codex / "agents").glob("*.toml"):
        text = agent.read_text()
        assert "@CODEX_SKILLS_DIR@" not in text, agent
        config = tomllib.loads(text)
        for skill in config.get("skills", {}).get("config", []):
            assert Path(skill["path"]).is_file(), skill
    tomllib.loads((codex / "config.shared.toml").read_text())
    PYTEST
    mkdir -p "$out"
  ''
