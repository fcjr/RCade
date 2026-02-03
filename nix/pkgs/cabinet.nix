# RCade Cabinet Package
#
# Wraps the pre-built cabinet app with Electron and required runtime dependencies.
# The JS bundle is built externally (via bun/vite) and this package provides
# the runtime environment to execute it.

{ lib
, stdenv
, makeWrapper
, electron
, bun
, nodejs_22

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
  version = "0.1.43";

  # Runtime library dependencies for Electron
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

in
stdenv.mkDerivation {
  inherit pname version;

  # Source is the cabinet directory from the monorepo
  # In a real deployment, this would be the built dist/ directory
  src = ../../cabinet;

  nativeBuildInputs = [ makeWrapper ];

  # Skip standard build phases - we just wrap the source
  dontBuild = true;
  dontConfigure = true;

  installPhase = ''
    runHook preInstall

    # Create output directories
    mkdir -p $out/lib/rcade-cabinet
    mkdir -p $out/bin

    # Copy the cabinet source/dist
    cp -r $src/* $out/lib/rcade-cabinet/

    # Create wrapper script that launches electron with the app
    cat > $out/bin/rcade-cabinet << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(dirname "$(dirname "$(readlink -f "$0")")")/lib/rcade-cabinet"

# Check if dist exists (pre-built) or if we need to build
if [ ! -d "$APP_DIR/dist" ]; then
    echo "Error: Cabinet app not built. Run from the project root:"
    echo "  cd cabinet && bun run build:main && bun run build:preload && vite build"
    exit 1
fi

exec electron "$APP_DIR" "$@"
EOF
    chmod +x $out/bin/rcade-cabinet

    # Wrap with runtime library paths and electron
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
