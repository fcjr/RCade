# RCade Cabinet Package
#
# Dependencies are fetched via a fixed-output derivation (FOD) that
# runs `bun install` with network access, working around bun2nix#71.
#
# To update dependencies:
#   1. Run `bun install` to update bun.lock
#   2. Rebuild with `nix build .#cabinet`
#   3. Update `bunModulesHash` with the hash from the error

{ lib
, stdenv
, makeWrapper
, autoPatchelfHook
, electron
, bun
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

  # Only package.json + bun.lock so code changes don't invalidate the FOD hash.
  depsSrc = lib.cleanSourceWith {
    src = ../..;
    filter = path: type:
      let
        baseName = baseNameOf path;
      in
        if type == "directory" then
          !(
            baseName == "node_modules" ||
            baseName == ".git" ||
            baseName == "dist" ||
            baseName == "release" ||
            baseName == ".turbo" ||
            baseName == ".svelte-kit" ||
            baseName == ".vite" ||
            baseName == ".claude" ||
            lib.hasPrefix "result" baseName
          )
        else
          baseName == "package.json" ||
          baseName == "bun.lock";
  };

  bunModulesHash = "sha256-OsvHFw+a/mKORQN3uGo+eKXJFJxNnbNZD+1YRhttHSc=";

  # FOD that fetches node_modules with network access and outputs a tarball.
  bunModules = stdenv.mkDerivation {
    name = "rcade-bun-modules.tar.gz";
    src = depsSrc;

    nativeBuildInputs = [ bun ];

    outputHashAlgo = "sha256";
    outputHashMode = "flat";
    outputHash = bunModulesHash;

    # Prevent patchShebangs from adding store-path references to the FOD output.
    dontFixup = true;

    buildPhase = ''
      export HOME=$(mktemp -d)
      bun install --frozen-lockfile --ignore-scripts
    '';

    installPhase = ''
      # Remove workspace symlinks (point to source dirs, invalid after extraction).
      # Keep bun internal symlinks (contain "node_modules" in target path).
      find . -name 'node_modules' -type d -prune | while read -r nm_dir; do
        find "$nm_dir" -type l | while read -r link; do
          target=$(readlink "$link")
          case "$target" in
            ../../*node_modules*) ;;
            ../../*) rm "$link" ;;
          esac
        done
      done

      tar czf $out $(find . -name 'node_modules' -type d -prune | sort)
    '';
  };

in
stdenv.mkDerivation {
  inherit pname version src;

  nativeBuildInputs = [
    makeWrapper
    autoPatchelfHook
    bun
    nodejs_22
  ];

  buildInputs = [
    hidapi
    libusb1
    systemd       # libudev
    stdenv.cc.cc  # libstdc++
  ];

  buildPhase = ''
    runHook preBuild

    export HOME=$(mktemp -d)

    tar xzf ${bunModules}

    # FOD skips patchShebangs (dontFixup), so we patch here instead.
    patchShebangs node_modules
    find . -mindepth 2 -maxdepth 4 -name 'node_modules' -type d | while read -r nm; do
      patchShebangs "$nm"
    done

    # Recreate workspace symlinks removed from the FOD.
    workspaces=$(${nodejs_22}/bin/node -p "require('./package.json').workspaces.join('\n')")
    for ws_dir in $workspaces; do
      if [ -f "$ws_dir/package.json" ]; then
        pkg_name=$(${nodejs_22}/bin/node -p "require('./$ws_dir/package.json').name" 2>/dev/null || true)
        if [ -n "$pkg_name" ]; then
          mkdir -p "node_modules/$(dirname "$pkg_name")"
          ln -sfn "$PWD/$ws_dir" "node_modules/$pkg_name"
        fi
      fi
    done

    node_modules/.bin/turbo build --filter="@rcade/api" --filter="@rcade/input-classic" --filter="@rcade/input-spinners" --filter="@rcade/sleep" --filter="@rcade/plugin-sleep" --filter="@rcade/plugin-menu-backend" --filter="@rcade/sdk" --filter="@rcade/sdk-plugin"

    cd cabinet

    node_modules/.bin/esbuild src/main/main.ts --bundle --outdir=dist/main --platform=node --format=esm --banner:js="import { createRequire } from 'module';const require = createRequire(import.meta.url);" --external:electron
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
