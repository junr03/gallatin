{
  lib,
  repositories ? import ./repositories.nix,
}:
let
  findSkills =
    repositoryName: relativePath: directory:
    let
      entries = builtins.readDir directory;
    in
    if builtins.pathExists (directory + "/SKILL.md") then
      [
        {
          name = if relativePath == "" then repositoryName else builtins.baseNameOf relativePath;
          source = directory;
        }
      ]
    else
      lib.concatLists (
        lib.mapAttrsToList (
          entry: kind:
          if kind == "directory" then
            findSkills repositoryName (if relativePath == "" then entry else "${relativePath}/${entry}") (
              directory + "/${entry}"
            )
          else
            [ ]
        ) entries
      );

  repositorySkills =
    repositoryName: repository:
    lib.concatMap
      (
        relativeDirectory:
        let
          directory = repository.source + "/${relativeDirectory}";
        in
        lib.optionals (builtins.pathExists directory) (findSkills repositoryName "" directory)
      )
      (
        repository.directories or [
          ".agents/skills"
          "skills"
        ]
      );

  skills = lib.concatLists (lib.mapAttrsToList repositorySkills repositories);
  names = map (skill: skill.name) skills;
  duplicates = lib.unique (
    lib.filter (name: builtins.length (lib.filter (candidate: candidate == name) names) > 1) names
  );
in
if duplicates != [ ] then
  throw "Skill directory names must be unique; duplicates: ${lib.concatStringsSep ", " duplicates}"
else
  builtins.listToAttrs (
    map (skill: {
      name = skill.name;
      value = skill.source;
    }) skills
  )
