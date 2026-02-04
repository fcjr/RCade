# RCade Cabinet Package
#
# Builds the RCade cabinet Electron app reproducibly using pnpm + fetchPnpmDeps.
# Dependencies are locked via pnpm-lock.yaml.
#
# To update dependencies:
#   1. Run `pnpm install` to update pnpm-lock.yaml
#   2. Update the pnpmDeps hash (set to "" and rebuild to get the correct hash)
#   3. Rebuild with `nix build .#cabinet`
#
# Build architecture:
#   esbuild (main.ts)    -> dist/main/main.js     (ESM, --external electron)
#   esbuild (preload.ts) -> dist/main/preload.js   (CJS, --external electron)
#   vite build           -> dist/renderer/          (Svelte SPA)
#
# All workspace deps (@rcade/*) and npm deps (hono, tar, semver, etc.) are
# bundled into the output files by esbuild. Only `electron` and node builtins
# remain as external imports at runtime.
#
# node-hid (native addon for arcade spinner hardware) is loaded at runtime
# via the bundled input-spinners plugin. It needs node_modules available.

{ lib
, stdenv
, makeWrapper
, autoPatchelfHook
, electron
, nodejs_22
, pnpm_10
, pnpmConfigHook
, fetchPnpmDeps
, jq

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
, xorg
, libGL
, pipewire
, libpulseaudio
}:

let
  pname = "rcade-cabinet";
  version = "0.2.1";

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
    xorg.libX11
    xorg.libXcomposite
    xorg.libXdamage
    xorg.libXext
    xorg.libXfixes
    xorg.libXrandr
    xorg.libxcb
    xorg.libxshmfence
  ];

  # Only include what the cabinet build actually needs as source.
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

in
stdenv.mkDerivation (finalAttrs: {
  inherit pname version src;

  nativeBuildInputs = [
    makeWrapper
    autoPatchelfHook
    nodejs_22
    pnpmConfigHook
    pnpm_10
    jq
  ];

  # Libraries needed by the node-hid native addon (.node prebuild).
  # autoPatchelfHook patches the RPATH of ELF binaries in $out to point here.
  buildInputs = [
    hidapi
    libusb1
    systemd       # libudev
    stdenv.cc.cc  # libstdc++
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    fetcherVersion = 2;
    hash = "sha256-bqOgSwyBrMx9G7FEB4pb5VAlr1Ua21bxheu5C/x6lg4=";  # Build once to get the correct hash from the error message
  };

  buildPhase = ''
    runHook preBuild

    export HOME=$(mktemp -d)
    
    node_modules/.bin/turbo build --filter="@rcade/api" --filter="@rcade/input-classic" --filter="@rcade/input-spinners" --filter="@rcade/sleep" --filter="@rcade/plugin-sleep" --filter="@rcade/plugin-menu-backend" --filter="@rcade/sdk" --filter="@rcade/sdk-plugin"

    cd cabinet
    pnpm run build:main
    pnpm run build:preload

    # Build renderer (Svelte SPA via vite)
    node_modules/.bin/vite build

    cd ..

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/rcade-cabinet $out/bin

    # Built artifacts
    cp -r cabinet/dist $out/lib/rcade-cabinet/

    # package.json is required - electron uses "main" field to find the entry point
    cp cabinet/package.json $out/lib/rcade-cabinet/package.json

    # Assets: icons, fonts (NotoColorEmoji.ttf), audio files
    cp -r cabinet/assets $out/lib/rcade-cabinet/

    # node-hid native addon: the input-spinners plugin loads this at runtime
    # via require("node-hid"). esbuild can't bundle native .node addons, so we
    # need the node_modules tree available for this one dependency.
    # pkg-prebuilds is also required (node-hid uses it to locate .node binaries).
    if [ -d node_modules/node-hid ]; then
      mkdir -p $out/lib/rcade-cabinet/node_modules
      cp -rL node_modules/node-hid $out/lib/rcade-cabinet/node_modules/
      cp -rL node_modules/pkg-prebuilds $out/lib/rcade-cabinet/node_modules/
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
})
