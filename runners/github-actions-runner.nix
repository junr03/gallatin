{
  autoPatchelfHook,
  curl,
  fetchurl,
  icu,
  krb5,
  lib,
  openssl,
  stdenv,
  stdenvNoCC,
  zlib,
}:

let
  system = stdenvNoCC.hostPlatform.system;
  releases = {
    "x86_64-linux" = {
      version = "2.337.0";
      url = "https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz";
      sha256 = "70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613";
    };
    "aarch64-darwin" = {
      version = "2.337.0";
      url = "https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-osx-arm64-2.337.0.tar.gz";
      sha256 = "5a2cd92908a93d7276a194e1de6008099f3e7946f3f8e14aa7a1a7b4a31fdec2";
    };
  };
  release = releases.${system} or (throw "Unsupported GitHub Actions runner platform: ${system}");
in
stdenvNoCC.mkDerivation {
  pname = "gallatin-github-actions-runner";
  inherit (release) version;

  src = fetchurl {
    inherit (release) url sha256;
  };

  dontUnpack = true;
  dontBuild = true;
  dontConfigure = true;

  nativeBuildInputs = lib.optional stdenv.hostPlatform.isLinux autoPatchelfHook;
  buildInputs = lib.optionals stdenv.hostPlatform.isLinux [
    stdenv.cc.cc
    curl
    icu
    krb5
    openssl
    zlib
  ];

  autoPatchelfIgnoreMissingDeps = lib.optionals stdenv.hostPlatform.isLinux [
    "libc.musl-x86_64.so.1"
    "liblttng-ust.so.0"
  ];

  installPhase = ''
    runHook preInstall
    install -d "$out"
    tar -xzf "$src" -C "$out"
    runHook postInstall
  '';

  meta = {
    description = "Pinned GitHub Actions runner for supported Gallatin hosts";
    homepage = "https://github.com/junr03/gallatin";
    license = lib.licenses.mit;
    platforms = [
      "x86_64-linux"
      "aarch64-darwin"
    ];
  };
}
