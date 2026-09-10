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
      };

      labels = mkOption {
        type = types.listOf types.str;
        default = [ ];
      };

      tokenFile = mkOption {
        type = types.nullOr types.str;
        default = null;
        description = "A short-lived registration token readable by the runner account.";
      };

      user = mkOption {
        type = types.str;
        default = "gallatin-runner-${name}";
      };

      workDirectory = mkOption {
        type = types.path;
        default = "/Users/${name}";
      };

      package = mkOption {
        type = types.package;
        default = runnerPackage;
      };

      preventSleep = mkOption {
        type = types.bool;
        default = false;
        description = "Disable system and disk sleep while this runner is enabled.";
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
  bootstrap =
    name: runner:
    pkgs.writeShellScript "${serviceName name}" ''
      set -eu
      runner_dir=${escapeShellArg runner.workDirectory}
      mkdir -p "$runner_dir"
      cd "$runner_dir"
      if [ ! -e ./config.sh ]; then
        cp -R ${escapeShellArg "${runner.package}/."} .
        chmod -R u+rwX,go-rwx .
      fi
      if [ ! -e ./.runner ]; then
        token=$(cat ${escapeShellArg runner.tokenFile})
        test -n "$token"
        ACTIONS_RUNNER_INPUT_TOKEN="$token" ${runnerConfig runner}
      fi
      exec "$runner_dir/run.sh"
    '';
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

    users.users = mapAttrs' (
      _: runner:
      nameValuePair runner.user {
        home = runner.workDirectory;
        createHome = true;
        shell = "/usr/bin/false";
        isHidden = true;
        description = "Gallatin GitHub Actions runner (${runner.runnerName})";
      }
    ) enabledRunners;

    launchd.daemons = mapAttrs' (
      name: runner:
      nameValuePair (serviceName name) {
        serviceConfig = {
          Label = serviceName name;
          UserName = runner.user;
          ProgramArguments = [
            "/bin/bash"
            "${bootstrap name runner}"
          ];
          WorkingDirectory = runner.workDirectory;
          EnvironmentVariables = {
            HOME = runner.workDirectory;
            PATH = lib.makeBinPath [
              pkgs.bash
              pkgs.coreutils
              pkgs.git
              pkgs.gnutar
            ];
          };
          RunAtLoad = true;
          KeepAlive = true;
          ThrottleInterval = 30;
          StandardOutPath = "${runner.workDirectory}/runner.stdout.log";
          StandardErrorPath = "${runner.workDirectory}/runner.stderr.log";
        };
      }
    ) enabledRunners;

    system.activationScripts.gallatinGithubRunnerPower.text =
      optionalString (any (runner: runner.preventSleep) (attrValues enabledRunners))
        ''
          /usr/bin/pmset -a sleep 0 disksleep 0
        '';
  };
}
