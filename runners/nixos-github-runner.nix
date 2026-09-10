{
  config,
  lib,
  pkgs,
  ...
}:

with lib;

let
  cfg = config.services.gallatin.githubActionsRunners;
  runnerPackage = pkgs.callPackage ./github-actions-runner.nix { };
  enabledRunners = filterAttrs (_: runner: runner.enable) cfg;
  runnerOptions = { name, ... }: {
    options = {
      enable = mkEnableOption "the Gallatin GitHub Actions runner ${name}";

      repository = mkOption {
        type = types.str;
        description = "The GitHub repository URL that owns this runner.";
      };

      runnerName = mkOption {
        type = types.str;
        default = name;
        description = "The name shown for this runner in GitHub.";
      };

      labels = mkOption {
        type = types.listOf types.str;
        default = [ ];
        description = "Additional labels assigned during registration.";
      };

      tokenFile = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "A short-lived registration token file.";
      };

      user = mkOption {
        type = types.str;
        default = "gallatin-${name}";
      };

      group = mkOption {
        type = types.str;
        default = "gallatin-${name}";
      };

      workDirectory = mkOption {
        type = types.path;
        default = "/var/lib/gallatin-github-runner/${name}";
      };

      package = mkOption {
        type = types.package;
        default = runnerPackage;
        description = "The pinned GitHub Actions runner package.";
      };
    };
  };

  runnerConfig =
    runner:
    escapeShellArgs (
      [
        "./config.sh"
        "--unattended"
        "--url"
        runner.repository
        "--name"
        runner.runnerName
      ]
      ++ optional (runner.labels != [ ]) [
        "--labels"
        (concatStringsSep "," runner.labels)
      ]
      ++ [
        "--work"
        "_work"
      ]
    );

  serviceName = name: "gallatin-github-runner-${name}";
in
{
  options.services.gallatin.githubActionsRunners = mkOption {
    type = types.attrsOf (types.submodule runnerOptions);
    default = { };
    description = "GitHub Actions runners managed by Gallatin.";
  };

  config = {
    assertions = mapAttrsToList (name: runner: {
      assertion = !runner.enable || runner.tokenFile != null;
      message = "services.gallatin.githubActionsRunners.${name}.tokenFile is required when enabled";
    }) cfg;

    users.groups = mapAttrs' (_: runner: nameValuePair runner.group { }) enabledRunners;

    users.users = mapAttrs' (
      _: runner:
      nameValuePair runner.user {
        isSystemUser = true;
        group = runner.group;
        home = runner.workDirectory;
        createHome = true;
        homeMode = "0700";
        description = "Gallatin GitHub Actions runner (${runner.runnerName})";
      }
    ) enabledRunners;

    systemd.services = mapAttrs' (
      name: runner:
      nameValuePair (serviceName name) {
        description = "Gallatin GitHub Actions runner ${runner.runnerName}";
        wantedBy = [ "multi-user.target" ];
        after = [ "network-online.target" ];
        wants = [ "network-online.target" ];

        serviceConfig = {
          User = runner.user;
          Group = runner.group;
          WorkingDirectory = runner.workDirectory;
          LoadCredential = [ "registration-token:${runner.tokenFile}" ];
          Environment = {
            HOME = runner.workDirectory;
            PATH = lib.makeBinPath [
              pkgs.bash
              pkgs.coreutils
              pkgs.git
              pkgs.gnutar
            ];
          };
          Restart = "always";
          RestartSec = 5;
          NoNewPrivileges = true;
          PrivateTmp = true;
          ProtectSystem = "strict";
          ProtectHome = true;
          ReadWritePaths = [ runner.workDirectory ];
          UMask = "0077";
        };

        preStart = ''
          set -eu
          cd ${escapeShellArg runner.workDirectory}
          if [ ! -e ./config.sh ]; then
            cp -R ${escapeShellArg "${runner.package}/."} .
            chmod -R u+rwX,go-rwx .
          fi
          if [ ! -e ./.runner ]; then
            token=$(cat "$CREDENTIALS_DIRECTORY/registration-token")
            test -n "$token"
            ACTIONS_RUNNER_INPUT_TOKEN="$token" ${runnerConfig runner}
          fi
        '';

        script = ''
          exec ./run.sh
        '';
      }
    ) enabledRunners;
  };
}
