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
        description = "A root-readable short-lived registration token file.";
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

      protectHome = mkOption {
        type = types.bool;
        default = true;
        description = "Hide /home, /root, and /run/user from the runner service.";
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

  runnerPath =
    lib.makeBinPath [
      pkgs.bash
      pkgs.coreutils
      pkgs.findutils
      pkgs.gawk
      pkgs.git
      pkgs.glibc.bin
      pkgs.gnugrep
      pkgs.gnutar
    ]
    + ":/usr/bin:/bin:/usr/sbin:/sbin";

  bootstrapScript =
    name: runner:
    let
      tokenPath = "${runner.workDirectory}/.gallatin-registration-token";
      registration = "cd ${escapeShellArg runner.workDirectory}; token=$(cat ${escapeShellArg tokenPath}); ACTIONS_RUNNER_INPUT_TOKEN=\"$token\" ${runnerConfig runner}";
    in
    pkgs.writeShellScript (bootstrapName name) ''
      set -eu
      runner_dir=${escapeShellArg runner.workDirectory}
      version_file="$runner_dir/.gallatin-runner-version"
      token_path=${escapeShellArg tokenPath}
      install -d -o ${escapeShellArg runner.user} -g ${escapeShellArg runner.group} -m 700 "$runner_dir"

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
        chown -R ${escapeShellArg "${runner.user}:${runner.group}"} "$runner_dir"
        chmod 700 "$runner_dir"
      fi

      if [ ! -e "$runner_dir/.runner" ]; then
        test -r ${escapeShellArg runner.tokenFile}
        token=$(cat ${escapeShellArg runner.tokenFile})
        test -n "$token"
        (
          trap 'rm -f "$token_path"' EXIT
          printf '%s\n' "$token" > "$token_path"
          chown ${escapeShellArg "${runner.user}:${runner.group}"} "$token_path"
          chmod 600 "$token_path"
          ${pkgs.util-linux}/bin/runuser -u ${escapeShellArg runner.user} -- ${pkgs.bash}/bin/bash -c ${escapeShellArg registration}
        )
      fi

      ${pkgs.systemd}/bin/systemctl start ${escapeShellArg (serviceName name)}
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

    systemd.services = listToAttrs (
      concatLists (
        mapAttrsToList (name: runner: [
          (nameValuePair (bootstrapName name) {
            description = "Bootstrap Gallatin GitHub Actions runner ${runner.runnerName}";
            wantedBy = [ "multi-user.target" ];
            after = [ "network-online.target" ];
            wants = [ "network-online.target" ];
            serviceConfig = {
              Type = "oneshot";
              RemainAfterExit = true;
              User = "root";
              Group = "root";
              ProtectSystem = "strict";
              ProtectHome = runner.protectHome;
              ReadWritePaths = [ runner.workDirectory ];
              UMask = "0077";
            };
            script = ''
              ${bootstrapScript name runner}
            '';
          })
          (nameValuePair (serviceName name) {
            description = "Gallatin GitHub Actions runner ${runner.runnerName}";
            serviceConfig = {
              User = runner.user;
              Group = runner.group;
              WorkingDirectory = runner.workDirectory;
              Restart = "always";
              RestartSec = 5;
              NoNewPrivileges = true;
              PrivateTmp = true;
              ProtectSystem = "strict";
              ProtectHome = runner.protectHome;
              ReadWritePaths = [ runner.workDirectory ];
              UMask = "0077";
            };
            environment = {
              HOME = runner.workDirectory;
              PATH = mkForce runnerPath;
            };
            script = ''
              exec ./run.sh
            '';
          })
        ]) enabledRunners
      )
    );
  };
}
