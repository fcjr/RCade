{ lib
, buildGoModule
}:

buildGoModule {
  pname = "marquee-display";
  version = "0.0.1";

  src = ../../machines/rcade-marquee/display;

  # Fixed-output derivation hash for the Go module dependencies.
  # To update: set to lib.fakeHash, run `nix build`, copy the correct
  # hash from the error message, and replace lib.fakeHash with it.
  vendorHash = lib.fakeHash;

  meta = with lib; {
    description = "RCade marquee RGB LED matrix display driver";
    platforms = [ "aarch64-linux" ];
    mainProgram = "marquee-display";
  };
}
