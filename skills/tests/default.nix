{ lib, pkgs }:
let
  discover = repositories: import ../inventory.nix { inherit lib repositories; };
  defaultFiles = discover { fixture.source = ./fixtures; };
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
  inventory = import ../inventory.nix { inherit lib; };
  sharedFiles = (import ../default.nix { inherit lib; }).home.file;
  bundledNames = builtins.attrNames (builtins.readDir ../../codex/skills);
  skillsPackage = pkgs.callPackage ../package.nix { };
  codexConfig = pkgs.callPackage ../../codex.nix { };
in
assert
  builtins.attrNames defaultFiles == [
    "agent"
    "example"
  ];
assert defaultFiles."example" == ./fixtures/skills/nested/example;
assert builtins.attrNames customFiles == [ "fixture" ];
assert missingFiles == { };
assert !duplicateFiles.success;
assert !repeatedFiles.success;
assert sharedFiles != { };
assert lib.all (name: inventory.${name} == ../../codex/skills + "/${name}") bundledNames;
assert inventory ? code-review;
assert
  builtins.attrNames sharedFiles
  == map (name: ".agents/skills/${name}") (builtins.attrNames inventory);
assert lib.all (file: builtins.pathExists (file.source + "/SKILL.md")) (
  builtins.attrValues sharedFiles
);
pkgs.runCommand "shared-agent-skills-check"
  {
    nativeBuildInputs = [ pkgs.python3 ];
    inherit skillsPackage codexConfig;
    expectedNames = builtins.toJSON (builtins.attrNames inventory);
  }
  ''
    python3 - <<'PYTEST'
    import json
    import os
    from pathlib import Path
    import tomllib

    skills = Path(os.environ["skillsPackage"])
    codex = Path(os.environ["codexConfig"])
    assert sorted(path.name for path in skills.iterdir()) == json.loads(os.environ["expectedNames"])
    for path in skills.iterdir():
        assert path.is_symlink(), path
        assert (path / "SKILL.md").is_file(), path
    assert (codex / "skills").is_symlink()
    assert (codex / "skills").resolve() == skills.resolve()
    references = []
    for agent in (codex / "agents").glob("*.toml"):
        text = agent.read_text()
        assert "@CODEX_SKILLS_DIR@" not in text, agent
        config = tomllib.loads(text)
        for skill in config.get("skills", {}).get("config", []):
            manifest = Path(skill["path"])
            assert manifest.is_file(), manifest
            assert manifest.parent.parent.resolve() == skills.resolve(), manifest
            references.append(manifest)
    assert references, "Expected agent skill references to verify"
    PYTEST
    mkdir -p "$out"
  ''
