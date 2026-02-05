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

  bunModulesHash = "sha256-YEE3v8Rf+gVw7Dt+9Tx2LxzRUNzf/3spISwdj8a47bE=";

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

    bun build src/main/main.ts --outfile dist/main/main.cjs --target node --format cjs --external electron --external node-hid
    bun build src/main/preload.ts --outdir dist/main --target node --format cjs --external electron
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

    # node-hid native addon (can't be bundled by bun build).
    # Location varies depending on bun's hoisting decisions.
    NODE_HID=""
    for nhid_dir in \
      node_modules/node-hid \
      node_modules/.bun/node_modules/node-hid \
      plugins/input-spinners/node_modules/node-hid \
      plugins/input-classic/node_modules/node-hid; do
      if [ -d "$nhid_dir" ]; then
        NODE_HID="$nhid_dir"
        break
      fi
    done
    PKG_PREBUILDS=""
    for pb_dir in \
      node_modules/pkg-prebuilds \
      node_modules/.bun/node_modules/pkg-prebuilds \
      plugins/input-spinners/node_modules/pkg-prebuilds; do
      if [ -d "$pb_dir" ]; then
        PKG_PREBUILDS="$pb_dir"
        break
      fi
    done

    if [ -n "$NODE_HID" ]; then
      mkdir -p $out/lib/rcade-cabinet/node_modules
      cp -rL "$NODE_HID" $out/lib/rcade-cabinet/node_modules/node-hid
      if [ -n "$PKG_PREBUILDS" ]; then
        cp -rL "$PKG_PREBUILDS" $out/lib/rcade-cabinet/node_modules/pkg-prebuilds
      fi

      # Keep only linux-x64 prebuilds (autoPatchelfHook can't patch others).
      find $out/lib/rcade-cabinet/node_modules/node-hid/prebuilds \
        -mindepth 1 -maxdepth 1 -type d \
        ! -name 'HID_hidraw-linux-x64' \
        ! -name 'HID-linux-x64' \
        -exec rm -rf {} +
    fi

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
