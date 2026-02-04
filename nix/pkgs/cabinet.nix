{ lib
, stdenv
, makeWrapper
, electron
, nodejs_22
, pnpm_10
, fetchPnpmDeps

# Runtime deps
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

  src = lib.cleanSourceWith {
    src = ../..;
    filter = path: type:
      let base = baseNameOf path;
      in !(
        base == "node_modules" ||
        base == ".git" ||
        base == "dist" ||
        base == "release" ||
        base == ".turbo" ||
        base == ".svelte-kit" ||
        base == ".vite" ||
        lib.hasPrefix "result" base ||
        lib.hasSuffix ".log" base
      );
  };

in
stdenv.mkDerivation {
  inherit pname version src;

  nativeBuildInputs = [
    makeWrapper
    nodejs_22
    pnpm_10
    pnpm_10.configHook
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit pname version src;
    fetcherVersion = 1;
    hash = "sha256-eqrEzFd7HiliHh5dMK3dXVXioao1CrXCoIjVnnpAcC0=";
  };

  buildPhase = ''
    runHook preBuild
    export HOME=$(mktemp -d)

    # ---- Renderer (Svelte / Vite) ----
    node_modules/.bin/vite build --config cabinet/vite.config.ts --root cabinet

    # ---- Main process (ESM) ----
    node_modules/.bin/esbuild cabinet/src/main/main.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --outdir=cabinet/dist/main \
      --external:electron \
      --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);"

    # ---- Preload (CJS, Electron requirement) ----
    node_modules/.bin/esbuild cabinet/src/main/preload.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outdir=cabinet/dist/main \
      --external:electron

    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/rcade-cabinet $out/bin

    cp -r cabinet/dist $out/lib/rcade-cabinet/
    cp cabinet/package.json $out/lib/rcade-cabinet/
    cp -r cabinet/assets $out/lib/rcade-cabinet/

    # Native addon (node-hid)
    if [ -d node_modules/node-hid ]; then
      mkdir -p $out/lib/rcade-cabinet/node_modules
      cp -r node_modules/node-hid $out/lib/rcade-cabinet/node_modules/
    fi

    cat > $out/bin/rcade-cabinet <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")/lib/rcade-cabinet"
exec electron "$APP_DIR" "$@"
EOF
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
}
