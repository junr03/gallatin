{
  lib,
  stdenvNoCC,
  python3,
  python3Packages,
  exiftool,
  makeWrapper,
}:

stdenvNoCC.mkDerivation {
  pname = "rename-picture";
  version = "1.0.0";

  # Use the contents of this repository as the source
  src = ./.;

  buildInputs = [
    python3
    python3Packages.tqdm
    makeWrapper
  ];

  installPhase = ''
    mkdir -p $out/bin
    cp scripts/rename_picture.py $out/bin/rename_picture
    chmod +x $out/bin/rename_picture

    # Wrap the script to include exiftool in PATH and Python packages
    wrapProgram $out/bin/rename_picture \
      --prefix PATH : ${lib.makeBinPath [ exiftool ]} \
      --prefix PYTHONPATH : ${python3Packages.tqdm}/${python3.sitePackages}
  '';

  meta = with lib; {
    description = "Script to rename picture files using datetime from EXIF data";
    homepage = "https://github.com/junr03/gallatin";
    license = licenses.mit;
    platforms = platforms.unix;
  };
}
