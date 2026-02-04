# RCade Cabinet Package
# ... (comments preserved) ...

{ lib
, stdenv
, makeWrapper
, electron
, nodejs_22
, pnpm_10
, fetchPnpmDeps
, fetchurl

# Runtime dependencies for Electron on Linux
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
, libdrm
, libxkbcommon
, mesa
, nspr
, nss
, pango
, systemd
, vulkan-loader
, xorg
, libGL
, pipewire
, libpulseaudio
}:

let
  pname = "rcade-cabinet";
  version = "0.2.1";

  electronZip = fetchurl {
    url = "https://github.com/electron/electron/releases/download/v39.5.1/electron-v39.5.1-linux-x64.zip";
    hash = "sha256-wahKYnpf/5hHdPDBRxUsT+Mkncw0S4uOCKffvrbeR3w="; 
  };

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
    xorg.libX11
    xorg.libXcomposite
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXrandr
    xorg.libxcb
    xorg.libxshmfence
  ];

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
        lib.hasSuffix ".log" baseName
      );
  };

in
stdenv.mkDerivation (finalAttrs: {
  inherit pname version src;

  nativeBuildInputs = [
    makeWrapper
    nodejs_22
    pnpm_10.configHook
    pnpm_10
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 1;
    hash = "sha256-eqrEzFd7HiliHh5dMK3dXVXioao1CrXCoIjVnnpAcC0=";
  };

  buildPhase = ''
    runHook preBuild

    export HOME=$(mktemp -d)

    # --- ADDED: Setup Electron Builder Cache ---
    # We trick electron-builder into thinking it already downloaded the binary.
    export ELECTRON_BUILDER_CACHE=$(mktemp -d)
    mkdir -p $ELECTRON_BUILDER_CACHE/electron
    # Symlink the pre-fetched zip. The name must match EXACTLY what the builder wants.
    ln -s ${electronZip} $ELECTRON_BUILDER_CACHE/electron/electron-v39.5.1-linux-x64.zip
    # -------------------------------------------

    # This runs electron-builder, which will now find the cache file and succeed
    pnpm run build --filter=...@rcade/client

    # Build main process (ESM, externalize electron)
    node_modules/.bin/esbuild cabinet/src/main/main.ts \
      --bundle \
      --outdir=cabinet/dist/main \
      --platform=node \
      --format=esm \
      --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);" \
      --external:electron

    # Build preload script (CJS, electron requirement)
    node_modules/.bin/esbuild cabinet/src/main/preload.ts \
      --bundle \
      --outdir=cabinet/dist/main \
      --platform=node \
      --format=cjs \
      --external:electron

    # Build renderer (Svelte SPA via vite)
    node_modules/.bin/vite build cabinet

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/rcade-cabinet $out/bin

    # Built artifacts
    cp -r cabinet/dist $out/lib/rcade-cabinet/

    # package.json is required - electron uses "main" field to find the entry point
    cp cabinet/package.json $out/lib/rcade-cabinet/

    # Assets: icons, fonts (NotoColorEmoji.ttf), audio files
    cp -r cabinet/assets $out/lib/rcade-cabinet/

    # node-hid native addon handling
    if [ -d node_modules/node-hid ]; then
      mkdir -p $out/lib/rcade-cabinet/node_modules
      cp -r node_modules/node-hid $out/lib/rcade-cabinet/node_modules/
    fi

    # Launcher script
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
      --set ELECTRON_DISABLE_SECURITY_WARNINGS "true"

    runHook postInstall
  '';

  meta = with lib; {
    description = "RCade arcade cabinet Electron application";
    homepage = "https://github.com/recursecenter/rcade";
    license = licenses.mit;
    platforms = platforms.linux;
    mainProgram = "rcade-cabinet";
  };
})