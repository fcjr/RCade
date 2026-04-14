{ lib
, buildGoModule
, fetchFromGitHub
}:

let
  # go mod vendor omits lib/rpi-rgb-led-matrix/include/ because it has no
  # .go files — only the headers needed by matrix.go's CGo #include.
  # Fetch the full source separately so we can inject them after vendoring.
  rgbmatrixRpi = fetchFromGitHub {
    owner = "fcjr";
    repo = "rgbmatrix-rpi";
    rev = "v0.4.2";
    # To get this hash: set to lib.fakeHash, deploy, copy the "got:" value.
    hash = "sha256-bgedEkh3KhFdqHV3ihOo44zlLCNwXQd3MaVfZ5rKij0=";
  };
in

buildGoModule {
  pname = "marquee-display";
  version = "0.0.1";

  src = ../../machines/rcade-marquee/display;

  # This hash covers the vendor tree including the injected/patched files below.
  # Update order: get rgbmatrixRpi.hash first, then this one.
  # Set to lib.fakeHash, deploy, copy the "got:" value from the build error.
  vendorHash = lib.fakeHash;

  # Two patches to the vendored fcjr/rgbmatrix-rpi source:
  overrideModAttrs = _: {
    postBuild = ''
      # 1. Inject C headers that go mod vendor skips (non-package subdirectory).
      mkdir -p vendor/github.com/fcjr/rgbmatrix-rpi/lib/rpi-rgb-led-matrix
      cp -r ${rgbmatrixRpi}/lib/rpi-rgb-led-matrix/include \
             vendor/github.com/fcjr/rgbmatrix-rpi/lib/rpi-rgb-led-matrix/

      # 2. Add missing SetBrightness to rpc.Client (v0.4.2 bug: Matrix interface
      #    requires it but rpc/client.go never implemented it).
      #    Conditional: rpc is only vendored when main.go imports it (i.e. when
      #    the RPC server is enabled); skip silently when it's commented out.
      if [ -f vendor/github.com/fcjr/rgbmatrix-rpi/rpc/client.go ]; then
        printf '\nfunc (c *Client) SetBrightness(_ int) {}\n' \
          >> vendor/github.com/fcjr/rgbmatrix-rpi/rpc/client.go
      fi
    '';
  };

  meta = with lib; {
    description = "RCade marquee RGB LED matrix display driver";
    platforms = [ "aarch64-linux" ];
    mainProgram = "marquee-display";
  };
}
