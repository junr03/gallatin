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
            accessTokenFile = "/run/secrets/blacktail-runner-access-token";
          };

          services.gallatin.githubActionsRunners.blacktail-linux = {
            enable = true;
            repository = "https://github.com/junr03/blacktail-sensitive";
            labels = [ "blacktail-linux" ];
            accessTokenFile = "/run/secrets/blacktail-runner-access-token";
          };
        })
      ];
    };
  };
}
```

NixOS uses a privileged one-shot bootstrap service for registration and keeps
the long-running runner service credential-free. The access-token source must
be root-readable and supplied by the private host configuration; it is read
only when the runner has not yet been registered. The bootstrap exchanges it
for GitHub's short-lived registration token. The bootstrap also replaces the
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
    accessTokenFile = "/private/var/db/blacktail-github-runner/access-token";
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
agent environment. The access-token source must be root-readable; it is read
only when registration is needed, while the generated registration token and
temporary authorization header are removed afterward.
`preventSleep` runs a scoped `caffeinate` daemon while the runner host is
enabled, so normal sleep settings are restored when the module is disabled.

## Registration and health checks

Provide a GitHub access token that can create runner registration tokens for the
target repository. A fine-grained token needs repository Administration write
permission; a classic token needs the `repo` scope for private repositories.
Never commit it to Gallatin. After deployment, verify the services locally and
query GitHub:

```sh
gh api repos/OWNER/REPOSITORY/actions/runners \
  --jq '.runners[] | {name,status,busy,labels:[.labels[].name]}'
```

Repository-specific workflows, including health workflows, stay in the
private repository that owns the runners.
