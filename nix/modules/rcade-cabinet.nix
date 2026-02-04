# RCade Cabinet Module
#
# This module configures a NixOS system to run as an RCade arcade cabinet.
# It sets up:
# - Auto-login to a dedicated user
# - Cage (minimal Wayland compositor) in kiosk mode
# - The RCade Electron application as a systemd service
# - Audio, input, and graphics drivers
#
# Usage in your configuration.nix:
#   services.rcade-cabinet = {
#     enable = true;
#     environmentFile = "/run/secrets/rcade.env";  # Optional, for API keys
#   };

{ self }:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.rcade-cabinet;

  # The RCade cabinet Electron app
  cabinetPackage = cfg.package;

  # Wrapper script for launching the cabinet app with proper environment
  launchScript = pkgs.writeShellScript "rcade-launch" ''
    export ELECTRON_OZONE_PLATFORM_HINT=wayland

    # Prepend the NixOS hardware driver path so the system's active GPU driver
    # (nvidia, mesa, etc.) is found before any bundled mesa libs in the package wrapper.
    export LD_LIBRARY_PATH="/run/opengl-driver/lib''${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

    ${cfg.preLaunchCommands}

    # Environment file for secrets (API keys, etc.)
    ${lib.optionalString (cfg.environmentFile != null) "source ${cfg.environmentFile}"}

    # Launch the cabinet app
    exec ${cabinetPackage}/bin/rcade-cabinet ${lib.escapeShellArgs cfg.extraArgs} \
      2>&1 | ${pkgs.systemd}/bin/systemd-cat -t rcade-cabinet
  '';

in
{
  options.services.rcade-cabinet = {
    enable = lib.mkEnableOption "RCade arcade cabinet";

    preLaunchCommands = lib.mkOption {
      type = lib.types.lines;
      default = "";
      description = "Shell commands to run inside Cage before starting the app (e.g. wlr-randr).";
    };

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.cabinet;
      defaultText = lib.literalExpression "self.packages.\${pkgs.stdenv.hostPlatform.system}.cabinet";
      description = "The RCade cabinet package to use.";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "rcade";
      description = "User account to run the cabinet application.";
    };

    # NOTE: apiKey option removed for security - API keys should not be stored
    # in the Nix store (world-readable). Use environmentFile instead.

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = ''
        Path to an environment file containing secrets (e.g., CABINET_API_KEY).
        This file should be readable only by root and will be sourced before
        launching the cabinet application.
      '';
    };

    extraArgs = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [ ];
      example = [ "--dev" "--scale" "2" ];
      description = "Extra command-line arguments to pass to the cabinet app.";
    };


    enableSound = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to enable ALSA sound support.";
    };

    enableVulkan = lib.mkOption {
      type = lib.types.bool;
      default = true;
      description = "Whether to enable Vulkan graphics support.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Whether to open firewall ports for the cabinet server.";
    };
  };

  config = lib.mkIf cfg.enable {
    # =========================================================================
    # User Configuration
    # =========================================================================
    users.users.${cfg.user} = {
      isNormalUser = true;
      description = "RCade Cabinet";
      extraGroups = [
        "video"
        "audio"
        "input"
        "render"
      ] ++ lib.optionals config.services.pulseaudio.enable [ "pulse" ]
        ++ lib.optionals config.services.pipewire.enable [ "pipewire" ];

      # No password - auto-login only
      initialPassword = lib.mkDefault "";
    };

    # =========================================================================
    # Display Server (Cage via greetd for auto-login)
    # =========================================================================
    # Use greetd to auto-login and launch cage with the cabinet app
    services.greetd = {
      enable = true;
      settings = {
        default_session = {
          command = "${pkgs.cage}/bin/cage -d -s -- ${launchScript}";
          user = cfg.user;
        };
      };
    };

    # Disable other display managers
    services.xserver.displayManager.lightdm.enable = lib.mkForce false;

    # =========================================================================
    # Graphics
    # =========================================================================
    hardware.graphics = {
      enable = true;
      enable32Bit = true;
    };

    # Vulkan support
    hardware.graphics.extraPackages = lib.mkIf cfg.enableVulkan (with pkgs; [
      vulkan-loader
      vulkan-validation-layers
      mesa
    ]);

    # Vulkan ICD discovery is handled automatically by vulkan-loader
    # No need to hardcode paths - the loader searches standard locations

    # =========================================================================
    # Audio
    # =========================================================================
    # Use PipeWire (modern audio)
    services.pipewire = lib.mkIf cfg.enableSound {
      enable = true;
      alsa.enable = true;
      alsa.support32Bit = true;
      pulse.enable = true;
    };

    # =========================================================================
    # Input Devices
    # =========================================================================
    # Enable udev rules for input devices (restricted to input group)
    services.udev.extraRules = ''
      SUBSYSTEM=="input", MODE="0660", GROUP="input"
      SUBSYSTEM=="usb", MODE="0660", GROUP="input"
    '';

    # =========================================================================
    # System Packages
    # =========================================================================
    environment.systemPackages = with pkgs; [
      # Graphics
      vulkan-tools
      mesa-demos
      wlr-randr

      # Debug/admin tools (minimal)
      htop
      vim
    ];

    # =========================================================================
    # Firewall
    # =========================================================================
    networking.firewall = lib.mkIf cfg.openFirewall {
      allowedTCPPorts = [ 3000 3001 ];  # Cabinet API ports
    };

    # =========================================================================
    # Nix Settings
    # =========================================================================
    nix.settings = {
      experimental-features = [ "nix-command" "flakes" ];
      auto-optimise-store = true;
    };

    # Garbage collection
    nix.gc = {
      automatic = true;
      dates = "weekly";
      options = "--delete-older-than 30d";
    };
  };
}
