{
  gallatin,
  lib,
  pkgs,
  ...
}:
let
  herdrConfig = pkgs.callPackage "${gallatin}/herdr.nix" { };
in
{
  # Herdr refuses modules whose files resolve outside its app folder, so the
  # package is copied in rather than linked from the Nix store. Links left by
  # earlier generations are removed first; other files there are not touched.
  home.activation.herdrAppConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    app="$HOME/.config/herdr-app"
    run mkdir -p "$app"
    run find "$app" -type l -lname '/nix/store/*' -delete
    run cp -R -f --no-preserve=mode,ownership "${herdrConfig}/." "$app/"
    run chmod -R u+w "$app"
  '';
}
