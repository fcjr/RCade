{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };
  outputs =
    {
      nixpkgs,
      flake-utils,
      fenix,
      ...
    }@inputs:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        overlays = [ fenix.overlays.default ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };
      in
      with pkgs;
      {
        formatter = nixfmt-tree;
        inherit inputs;
        devShells.default = mkShell {
          buildInputs = [
            (pkgs.fenix.combine [
              pkgs.fenix.stable.defaultToolchain
              pkgs.fenix.stable.rust-src
            ])
            openssl
            pkg-config
            bun
            act
          ];
          LD_LIBRARY_PATH = lib.makeLibraryPath [
            openssl
            nspr
            nss
          ];
        };
      }
    );
}
