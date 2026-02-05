{
  description = "RCade - Community-driven arcade cabinet system";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # Rust toolchain
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Home Manager for user-level config
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Flake utilities
    flake-utils.url = "github:numtide/flake-utils";

    # Bun packaging for Nix (reproducible builds)
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

  };

  outputs = { self, nixpkgs, fenix, home-manager, flake-utils, bun2nix, ... }@inputs:
    let
      # Systems we support for development
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];

      # Helper to generate attrs for each system
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      # Get pkgs for a given system
      pkgsFor = system: import nixpkgs {
        inherit system;
        overlays = [ fenix.overlays.default self.overlays.default ];
        config.allowUnfree = true;
      };

      # ISO image configuration (used by packages.x86_64-linux.iso)
      isoSystem = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        specialArgs = { inherit inputs self; };
        modules = [
          "${nixpkgs}/nixos/modules/installer/cd-dvd/installation-cd-minimal.nix"
          self.nixosModules.rcade-cabinet
          ({ pkgs, lib, ... }: {
            # ISO-specific settings
            isoImage.squashfsCompression = "gzip -Xcompression-level 1";  # Faster builds

            # Include cabinet service
            services.rcade-cabinet = {
              enable = true;
              enableSound = false;  # Avoid conflicts with installer audio
            };

            # Networking
            networking.hostName = "rcade";
            networking.networkmanager.enable = true;

            # Allow login
            users.users.rcade = {
              isNormalUser = true;
              extraGroups = [ "wheel" "video" "audio" "networkmanager" ];
              initialPassword = "rcade";
            };

            # Nix settings
            nix.settings.experimental-features = [ "nix-command" "flakes" ];

            nixpkgs.overlays = [ fenix.overlays.default self.overlays.default ];
            nixpkgs.config.allowUnfree = true;

            system.stateVersion = "24.05";
          })
        ];
      };
    in
    {
      # =======================================================================
      # Overlays
      # =======================================================================
      overlays.default = final: prev: {
        # Add RCade-specific packages here
        rcade = {
          # The cabinet Electron app package - built reproducibly via bun2nix
          cabinet = final.callPackage ./nix/pkgs/cabinet.nix {
            inherit bun2nix;
          };
        };
      };

      # =======================================================================
      # NixOS Modules
      # =======================================================================
      nixosModules = {
        # The RCade cabinet module - configures systemd service, display, etc.
        rcade-cabinet = import ./nix/modules/rcade-cabinet.nix { inherit self; };

        # Default module (alias)
        default = self.nixosModules.rcade-cabinet;
      };

      # =======================================================================
      # Machine Configurations
      # =======================================================================
      nixosConfigurations = {
        # Template machine - copy and customize for your hardware
        rcade-template = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          specialArgs = { inherit inputs self; };
          modules = [
            ./machines/template/configuration.nix
            home-manager.nixosModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = { inherit inputs self; };
            }
          ];
        };

	# Rose's Razer Laptop (Current Production Machine)
	prod = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          specialArgs = { inherit inputs self; };
          modules = [
            ./machines/rcade-rose-laptop/configuration.nix
            home-manager.nixosModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = { inherit inputs self; };
            }
          ];
        };

        # VM for testing the cabinet
        rcade-vm = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          specialArgs = { inherit inputs self; };
          modules = [
            ./nix/modules/rcade-vm.nix
            self.nixosModules.rcade-cabinet
            {
              services.rcade-cabinet.enable = true;
              nixpkgs.overlays = [ fenix.overlays.default self.overlays.default ];
            }
          ];
        };
      };

      # =======================================================================
      # Development Shells (per-system)
      # =======================================================================
      devShells = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          default = pkgs.mkShell {
            name = "rcade-dev";

            buildInputs = with pkgs; [
              # Rust toolchain (stable + src for IDE support)
              (pkgs.fenix.combine [
                pkgs.fenix.stable.defaultToolchain
                pkgs.fenix.stable.rust-src
              ])

              # Build essentials
              openssl
              pkg-config

              # JavaScript runtime & package manager
              bun
              nodejs_22

              # Nix tooling for reproducible builds
              bun2nix.packages.${system}.default

              # Useful dev tools
              just  # Task runner

            ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              # Linux-specific deps for Electron
              alsa-lib
              mesa
              libGL
              vulkan-loader
              vulkan-headers
            ];

            # Library paths for native compilation
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (with pkgs; [
              openssl
              nspr
              nss
            ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
              alsa-lib
              mesa
              libGL
              vulkan-loader
            ]);

            shellHook = ''
              echo "🕹️  RCade development environment"
              echo ""
              echo "Available commands:"
              echo "  bun install    - Install dependencies"
              echo "  turbo dev      - Start development servers"
              echo "  turbo build    - Build all packages"
              echo ""
            '';
          };

          # Minimal shell for CI/quick tasks
          ci = pkgs.mkShell {
            name = "rcade-ci";
            buildInputs = with pkgs; [ bun nodejs_22 ];
          };
        }
      );

      # =======================================================================
      # Packages (per-system)
      # =======================================================================
      packages = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          # Export the cabinet package
          cabinet = pkgs.rcade.cabinet;
          default = pkgs.rcade.cabinet;
        } // nixpkgs.lib.optionalAttrs (system == "x86_64-linux") {
          # Build with: nix build .#vm 
          vm = self.nixosConfigurations.rcade-vm.config.system.build.vm;
      
          # Build with: nix build .#iso
          iso = isoSystem.config.system.build.isoImage;
        }
      );

      # =======================================================================
      # Formatter (per-system)
      # =======================================================================
      formatter = forAllSystems (system: (pkgsFor system).nixfmt-tree);

      # =======================================================================
      # Checks (per-system)
      # =======================================================================
      checks = forAllSystems (system:
        let
          pkgs = pkgsFor system;
        in
        {
          # Verify devshell builds
          devshell = self.devShells.${system}.default;
        } // pkgs.lib.optionalAttrs (system == "x86_64-linux") {
          # NixOS configuration checks (Linux only)
          # Note: rcade-template is excluded from checks because it requires
          # hardware-configuration.nix to be generated on target hardware.
          # The VM configuration is checked instead.
          rcade-vm = self.nixosConfigurations.rcade-vm.config.system.build.toplevel;
        }
      );
    };
}
