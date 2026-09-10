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

NixOS uses a privileged one-shot bootstrap service for registration and keeps
the long-running runner service credential-free. The token source must be
root-readable and supplied by the private host configuration; it is read only
when the runner has not yet been registered. The bootstrap also replaces the
mutable runner tree when the pinned package version changes while preserving
the registration state and `_work` directory. Set `protectHome = false` when
using a work directory under `/home`; the default `/var/lib` location remains
protected.

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
    uid = 502;
    workDirectory = "/Users/blacktail-runner";
    preventSleep = true;
  };
}
```

The macOS module creates a hidden non-admin account and uses a root-owned
launchd bootstrap daemon for registration and upgrades. The long-running
runner daemon has no registration token, personal SSH agent, or 1Password
agent environment. The token source must be root-readable; it is read only
when registration is needed, while the temporary copy is removed afterward.
`preventSleep` runs a scoped `caffeinate` daemon while the runner host is
enabled, so normal sleep settings are restored when the module is disabled.

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
