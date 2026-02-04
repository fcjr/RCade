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
, electron
, nodejs_22
, pnpm_10
, fetchPnpmDeps

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
    hash = "sha256-eqrEzFd7HiliHh5dMK3dXVXioao1CrXCoIjVnnpAcC0=";  # Build once to get the correct hash from the error message
  };

  buildPhase = ''
    runHook preBuild

    export HOME=$(mktemp -d)

    pnpm run build --filter="!{web,cli}"

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

    # node-hid native addon: the input-spinners plugin loads this at runtime
    # via require("node-hid"). esbuild can't bundle native .node addons, so we
    # need the node_modules tree available for this one dependency.
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
