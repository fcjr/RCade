# RCade Cabinet Package
#
# Dependencies are fetched via a fixed-output derivation (FOD) that
# runs `pnpm install` with network access.
#
# To update dependencies:
#   1. Run `pnpm install` to update pnpm-lock.yaml
#   2. Rebuild with `nix build .#cabinet`
#   3. Update `pnpmModulesHash` with the hash from the error

{ lib
, stdenv
, makeWrapper
, autoPatchelfHook
, electron
, pnpm_9
, fetchPnpmDeps
, pnpmConfigHook
, nodejs_22
, alsa-lib
, at-spi2-atk
, at-spi2-core
, atk
, cairo
, cups
, dbus
, expat
, gdk-pixbuf
, glib
, gtk3
, hidapi
, libdrm
, libusb1
, libxkbcommon
, mesa
, nspr
, nss
, pango
, systemd
, vulkan-loader
, libGL
, libx11
, libxcomposite
, libxdamage
, libxext
, libxfixes
, libxrandr
, libxcb
, libxshmfence
, pipewire
, libpulseaudio
}:

let
  runtimeLibs = [
    alsa-lib
    at-spi2-atk
    at-spi2-core
    atk
    cairo
    cups
    dbus
    expat
    gdk-pixbuf
    glib
    gtk3
    hidapi
    libdrm
    libxkbcommon
    libGL
    mesa
    nspr
    nss
    pango
    pipewire
    libpulseaudio
    systemd
    vulkan-loader
    libx11
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libxcb
    libxshmfence
  ];

in
stdenv.mkDerivation rec {
  pname = "rcade-cabinet";
  version = "0.2.1";

  src = lib.cleanSourceWith {
    src = ../..;
    filter = path: type:
      let
        baseName = baseNameOf path;
      in
      !(
        baseName == "node_modules" ||
        baseName == ".git" ||
        baseName == "dist" ||
        baseName == "release" ||
        baseName == ".turbo" ||
        baseName == ".svelte-kit" ||
        baseName == ".vite" ||
        baseName == ".claude" ||
        lib.hasPrefix "result" baseName ||
        lib.hasSuffix ".log" baseName ||
        lib.hasInfix "cli/templates" path
      );
  };

  nativeBuildInputs = [
    makeWrapper
    autoPatchelfHook
    pnpm_9
    nodejs_22
    pnpmConfigHook
  ];

  buildInputs = [
    hidapi
    libusb1
    systemd       # libudev
    stdenv.cc.cc  # libstdc++
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit
      pname
      version
      src
      ;
    pnpm = pnpm_9;
    fetcherVersion = 1;
    hash = "sha256-U7UhUkuMQQSNeFlJkuL15aQmwvjQRj1PJmTgXgO8AGA=";
  };

  buildPhase = ''
    runHook preBuild

    node_modules/.bin/turbo build --filter="@rcade/api" --filter="@rcade/input-classic" --filter="@rcade/input-spinners" --filter="@rcade/sleep" --filter="@rcade/plugin-sleep" --filter="@rcade/plugin-menu-backend" --filter="@rcade/sdk" --filter="@rcade/sdk-plugin"

    cd cabinet

    node_modules/.bin/esbuild src/main/main.ts --bundle --outfile=dist/main/main.cjs --platform=node --format=cjs --define:import.meta.url=import_meta_url --banner:js="var import_meta_url=require('url').pathToFileURL(__filename).href;" --external:electron --external:node-hid
    node_modules/.bin/esbuild src/main/preload.ts --bundle --outdir=dist/main --platform=node --format=cjs --external:electron
    node_modules/.bin/vite build

    cd ..

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/rcade-cabinet $out/bin

    cp -r cabinet/dist $out/lib/rcade-cabinet/
    cp cabinet/package.json $out/lib/rcade-cabinet/package.json
    cp -r cabinet/assets $out/lib/rcade-cabinet/

    # Copy native modules that are --external in the esbuild bundle
    # and their runtime dependencies.
    mkdir -p $out/lib/rcade-cabinet/node_modules
    cp -rL node_modules/.pnpm/node-hid@*/node_modules/node-hid $out/lib/rcade-cabinet/node_modules/
    cp -rL node_modules/.pnpm/node-hid@*/node_modules/pkg-prebuilds $out/lib/rcade-cabinet/node_modules/
    # Remove musl and non-x64 prebuilds to avoid autoPatchelfHook failures
    find $out/lib/rcade-cabinet/node_modules/node-hid/prebuilds -type d \( -name '*musl*' -o -name '*arm*' \) -exec rm -rf {} + 2>/dev/null || true

    cat > $out/bin/rcade-cabinet <<'LAUNCHER'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")/lib/rcade-cabinet"
exec electron "$APP_DIR" "$@"
LAUNCHER
    chmod +x $out/bin/rcade-cabinet

    wrapProgram $out/bin/rcade-cabinet \
      --prefix PATH : "${lib.makeBinPath [ electron ]}" \
      --prefix LD_LIBRARY_PATH : "${lib.makeLibraryPath runtimeLibs}" \
      --set ELECTRON_DISABLE_SECURITY_WARNINGS "true" \
      --set ELECTRON_FORCE_IS_PACKAGED "1" \
      --set RCADE_NIX "true"

    runHook postInstall
  '';

  meta = with lib; {
    description = "RCade arcade cabinet Electron application";
    homepage = "https://github.com/recursecenter/rcade";
    license = licenses.mit;
    platforms = platforms.linux;
    mainProgram = "rcade-cabinet";
  };
}
