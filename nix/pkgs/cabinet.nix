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
, nodejs_22
, cacert
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
    libx11
    libxcomposite
    libxdamage
    libxext
    libxfixes
    libxrandr
    libxcb
    libxshmfence
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

  # Only package.json + pnpm-lock.yaml so code changes don't invalidate the FOD hash.
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
          baseName == "pnpm-lock.yaml" ||
          baseName == "pnpm-workspace.yaml" ||
          baseName == ".npmrc";
  };

  pnpmModulesHash = "sha256-aYcxJyi3NIIacknF7+Uxr5I592dDJXgsDzMNkWTCk5s=";

  # FOD that fetches node_modules with network access and outputs a tarball.
  pnpmModules = stdenv.mkDerivation {
    name = "rcade-pnpm-modules.tar.gz";
    src = depsSrc;

    nativeBuildInputs = [ nodejs_22 pnpm_9 cacert ];

    outputHashAlgo = "sha256";
    outputHashMode = "flat";
    outputHash = pnpmModulesHash;

    # Prevent patchShebangs from adding store-path references to the FOD output.
    dontFixup = true;

    buildPhase = ''
      export HOME=$(mktemp -d)
      export SSL_CERT_FILE="${cacert}/etc/ssl/certs/ca-bundle.crt"
      pnpm install --frozen-lockfile --ignore-scripts
    '';

    installPhase = ''
      # Remove workspace symlinks (point to source dirs, invalid after extraction).
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
    pnpm_9
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

    tar xzf ${pnpmModules}

    # FOD skips patchShebangs (dontFixup), so we patch here instead.
    patchShebangs node_modules
    find . -mindepth 2 -maxdepth 4 -name 'node_modules' -type d | while read -r nm; do
      patchShebangs "$nm"
    done

    # Recreate workspace symlinks removed from the FOD.
    # Parse workspace dirs from pnpm-workspace.yaml (simple "  - dir" format)
    workspaces=$(grep '^ *- ' pnpm-workspace.yaml | sed 's/^ *- //')
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
