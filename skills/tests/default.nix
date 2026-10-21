{ lib, pkgs }:
let
  discover = repositories: import ../skill-files.nix { inherit lib repositories; };
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
  sharedFiles = (import ../default.nix { inherit lib; }).home.file;
in
assert
  builtins.attrNames defaultFiles == [
    ".agents/skills/agent"
    ".agents/skills/example"
  ];
assert defaultFiles.".agents/skills/example".source == ./fixtures/skills/nested/example;
assert builtins.attrNames customFiles == [ ".agents/skills/fixture" ];
assert missingFiles == { };
assert !duplicateFiles.success;
assert !repeatedFiles.success;
assert sharedFiles != { };
assert lib.all (file: builtins.pathExists (file.source + "/SKILL.md")) (
  builtins.attrValues sharedFiles
);
pkgs.runCommand "shared-agent-skills-check" { } "mkdir -p $out"
