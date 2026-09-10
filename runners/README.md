# GitHub Actions runner hosts

Gallatin provides the reusable host modules for private GitHub Actions runners.
The modules configure the runner account, service, pinned runner release, and
registration flow. They do not contain repository credentials or registration
tokens.

The `runners/` directory is a self-contained flake. The repository root remains
available for unrelated shared Nix files. The runner flake exports two modules:

- `nixosModules.github-actions-runner`
- `darwinModules.github-actions-runner`

## NixOS

Add the Gallatin flake as an input and import the module:

```nix
{
  inputs.gallatin.url = "github:junr03/gallatin?dir=runners";

  outputs = { self, nixpkgs, gallatin, ... }: {
    nixosConfigurations.electricpeak = nixpkgs.lib.nixosSystem {
      system = "x86_64-linux";
      modules = [
        gallatin.nixosModules.github-actions-runner
        ({ ... }: {
          services.gallatin.githubActionsRunners.blacktail-control = {
            enable = true;
            repository = "https://github.com/junr03/blacktail-sensitive";
            labels = [ "blacktail-control" ];
            tokenFile = "/run/secrets/blacktail-control-registration-token";
          };

          services.gallatin.githubActionsRunners.blacktail-linux = {
            enable = true;
            repository = "https://github.com/junr03/blacktail-sensitive";
            labels = [ "blacktail-linux" ];
            tokenFile = "/run/secrets/blacktail-linux-registration-token";
          };
        })
      ];
    };
  };
}
```

NixOS uses `LoadCredential` so the systemd service can read a short-lived
registration token without putting it in the unit environment. The token file
must be supplied by the private host configuration.

## macOS

Import `darwinModules.github-actions-runner` from the Gallatin flake in the
private nix-darwin configuration:

```nix
{
  services.gallatin.githubActionsRunners.blacktail-macos = {
    enable = true;
    repository = "https://github.com/junr03/blacktail-sensitive";
    labels = [ "blacktail-macos" ];
    tokenFile = "/Users/blacktail-runner/registration-token";
    user = "blacktail-runner";
    workDirectory = "/Users/blacktail-runner";
    preventSleep = true;
  };
}
```

The macOS module creates a hidden non-admin account, loads a root-owned
launchd daemon under that account, and leaves personal SSH and 1Password agent
variables out of the service environment. The token file must be readable by
the runner account and should be removed after registration if the private host
configuration does not need to retain it.

## Registration and health checks

Create short-lived registration tokens from an authenticated administrator
workstation. Never commit them to Gallatin. After deployment, verify the
services locally and query GitHub:

```sh
gh api repos/OWNER/REPOSITORY/actions/runners \
  --jq '.runners[] | {name,status,busy,labels:[.labels[].name]}'
```

Repository-specific workflows, including health workflows, stay in the
private repository that owns the runners.
