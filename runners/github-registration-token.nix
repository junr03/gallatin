{
  lib,
  pkgs,
}:

runner:

let
  repositoryUrl = lib.removeSuffix "/" runner.repository;
  repositoryPath = lib.removeSuffix ".git" (lib.removePrefix "https://github.com/" repositoryUrl);
  registrationUrl = "https://api.github.com/repos/${repositoryPath}/actions/runners/registration-token";
in
''
  access_token_file=${lib.escapeShellArg runner.accessTokenFile}
  test -r "$access_token_file"
  access_token=$(cat "$access_token_file")
  test -n "$access_token"

  token=$(
    authorization_header=$(mktemp)
    cleanup_authorization_header() {
      rm -f "$authorization_header"
    }
    trap cleanup_authorization_header EXIT
    printf 'Authorization: Bearer %s\n' "$access_token" > "$authorization_header"

    ${pkgs.curl}/bin/curl \
      --fail \
      --silent \
      --show-error \
      --request POST \
      --header "@$authorization_header" \
      --header 'Accept: application/vnd.github+json' \
      --header 'X-GitHub-Api-Version: 2022-11-28' \
      ${lib.escapeShellArg registrationUrl} \
    | ${pkgs.jq}/bin/jq --exit-status --raw-output '.token | select(type == "string" and length > 0)'
  )
  unset access_token
  test -n "$token"
''
