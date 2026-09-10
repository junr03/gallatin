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
        description = "A root-readable short-lived registration token file.";
      };

      user = mkOption {
        type = types.str;
        default = "gallatin-runner-${name}";
      };

      uid = mkOption {
        type = types.int;
        description = "A unique macOS UID for the hidden runner account.";
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
        description = "Run caffeinate while this runner is enabled.";
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
      ++ optionals (runner.labels != [ ]) [
        "--labels"
        (concatStringsSep "," runner.labels)
      ]
      ++ [
        "--work"
        "_work"
      ]
    );

  serviceName = name: "gallatin-github-runner-${name}";
  bootstrapName = name: "${serviceName name}-bootstrap";
  tokenPath = runner: "${runner.workDirectory}/.gallatin-registration-token";

  runnerPath =
    lib.makeBinPath [
      pkgs.bash
      pkgs.coreutils
      pkgs.git
      pkgs.gnutar
    ]
    + ":/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin";

  bootstrap =
    name: runner:
    let
      registration = "cd ${escapeShellArg runner.workDirectory}; token=$(cat ${escapeShellArg (tokenPath runner)}); ACTIONS_RUNNER_INPUT_TOKEN=\"$token\" ${runnerConfig runner}";
    in
    pkgs.writeShellScript (bootstrapName name) ''
      set -eu
      runner_dir=${escapeShellArg runner.workDirectory}
      version_file="$runner_dir/.gallatin-runner-version"
      token_path=${escapeShellArg (tokenPath runner)}
      install -d -o ${escapeShellArg runner.user} -m 700 "$runner_dir"

      if [ ! -e "$runner_dir/config.sh" ] || [ "$(cat "$version_file" 2>/dev/null || true)" != ${escapeShellArg runner.package.version} ]; then
        state_dir=$(mktemp -d)
        trap 'rm -rf "$state_dir"' EXIT
        for state in .runner .credentials .credentials_rsaparams .env .path _work; do
          if [ -e "$runner_dir/$state" ]; then
            mv "$runner_dir/$state" "$state_dir/$state"
          fi
        done
        find "$runner_dir" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
        cp -R ${escapeShellArg "${runner.package}/."} "$runner_dir/"
        for state in "$state_dir"/*; do
          if [ -e "$state" ]; then
            mv "$state" "$runner_dir/"
          fi
        done
        printf '%s\n' ${escapeShellArg runner.package.version} > "$version_file"
        chown -R ${escapeShellArg runner.user} "$runner_dir"
        chmod 700 "$runner_dir"
      fi

      if [ ! -e "$runner_dir/.runner" ]; then
        test -r ${escapeShellArg runner.tokenFile}
        token=$(cat ${escapeShellArg runner.tokenFile})
        test -n "$token"
        (
          trap 'rm -f "$token_path"' EXIT
          printf '%s\n' "$token" > "$token_path"
          chown ${escapeShellArg runner.user} "$token_path"
          chmod 600 "$token_path"
          /usr/bin/su -s /bin/bash -l ${escapeShellArg runner.user} -c ${escapeShellArg registration}
        )
      fi
    '';

  runnerStart =
    name: runner:
    pkgs.writeShellScript "${serviceName name}-start" ''
      set -eu
      runner_dir=${escapeShellArg runner.workDirectory}
      for attempt in $(seq 1 60); do
        if [ -e "$runner_dir/.runner" ]; then
          exec "$runner_dir/run.sh"
        fi
        sleep 1
      done
      echo "Runner registration did not complete before timeout" >&2
      exit 1
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

    users.knownUsers = mkAfter (map (runner: runner.user) (attrValues enabledRunners));

    users.users = mapAttrs' (
      _: runner:
      nameValuePair runner.user {
        uid = runner.uid;
        home = runner.workDirectory;
        createHome = true;
        shell = "/usr/bin/false";
        isHidden = true;
        description = "Gallatin GitHub Actions runner (${runner.runnerName})";
      }
    ) enabledRunners;

    launchd.daemons =
      (mapAttrs' (
        name: runner:
        nameValuePair (bootstrapName name) {
          serviceConfig = {
            Label = bootstrapName name;
            ProgramArguments = [
              "/bin/bash"
              "${bootstrap name runner}"
            ];
            RunAtLoad = true;
            KeepAlive = false;
            LaunchOnlyOnce = true;
            StandardOutPath = "/var/log/${bootstrapName name}.stdout.log";
            StandardErrorPath = "/var/log/${bootstrapName name}.stderr.log";
          };
        }
      ) enabledRunners)
      // (mapAttrs' (
        name: runner:
        nameValuePair (serviceName name) {
          serviceConfig = {
            Label = serviceName name;
            UserName = runner.user;
            ProgramArguments = [
              "/bin/bash"
              "${runnerStart name runner}"
            ];
            WorkingDirectory = runner.workDirectory;
            EnvironmentVariables = {
              HOME = runner.workDirectory;
              PATH = runnerPath;
            };
            RunAtLoad = true;
            KeepAlive = true;
            ThrottleInterval = 30;
            StandardOutPath = "${runner.workDirectory}/runner.stdout.log";
            StandardErrorPath = "${runner.workDirectory}/runner.stderr.log";
          };
        }
      ) enabledRunners)
      // optionalAttrs (any (runner: runner.preventSleep) (attrValues enabledRunners)) {
        gallatin-github-runner-power = {
          serviceConfig = {
            Label = "gallatin-github-runner-power";
            ProgramArguments = [
              "/usr/bin/caffeinate"
              "-dimsu"
            ];
            RunAtLoad = true;
            KeepAlive = true;
          };
        };
      };
  };
}
