# RCade Cabinet - Template Configuration
#
# This is a template NixOS configuration for an RCade arcade cabinet.
# Copy this directory to create a new machine configuration:
#
#   cp -r machines/template machines/my-cabinet
#
# Then customize:
# 1. Update the hostname in this file
# 2. Generate hardware-configuration.nix on the target machine:
#    nixos-generate-config --show-hardware-config > hardware-configuration.nix
# 3. Add the machine to flake.nix nixosConfigurations
# 4. Update SSH keys and other settings as needed
#
# Deploy with:
#   nixos-rebuild switch --flake .#my-cabinet

{ config, pkgs, lib, inputs, self, ... }:

let
  # Import shared utilities
  rcadeLib = import ../../nix/lib { inherit lib; };
in
{
  imports = [
    # Hardware configuration - MUST be generated on target machine
    ./hardware-configuration.nix

    # RCade cabinet module
    self.nixosModules.rcade-cabinet
  ];

  # ===========================================================================
  # Machine Identity
  # ===========================================================================
  networking.hostName = "rcade";  # Change this for each machine
  networking.networkmanager.enable = true;

  # ===
  # Nvidia Graphics
  # ===
  services.xserver.videoDrivers = [ "nvidia" ];
  hardware.nvidia = {
    modesetting.enable = true;
    open = false;
    powerManagement.enable = true;
    prime = {
      offload.enable = false;
      sync.enable = false;
    };
  };
  boot.blacklistedKernelModules = [ "nouveau" ];
  environment.sessionVariables = {
    GBM_BACKEND = "nvidia-drm";
    __GLX_VENDOR_LIBRARY_NAME = "nvidia";
    WLR_NO_HARDWARE_CURSORS = "1";
    __NV_PRIME_RENDER_OFFLOAD = "1";
    WLR_RENDERER = "vulkan";
  };

  # ===========================================================================
  # RCade Cabinet Service
  # ===========================================================================
  services.rcade-cabinet = {
    enable = true;

    # Secrets file for API keys (create this on the target machine)
    # Format: CABINET_API_KEY=your-api-key-here
    # environmentFile = "/etc/rcade/secrets.env";

    # Extra arguments for the cabinet app
    extraArgs = [ ];

    # Audio support (default: true)
    enableSound = true;

    # Vulkan/WebGPU support (default: true)
    enableVulkan = true;

    preLaunchCommands = ''
      # Disable the Laptop screen (eDP-1) so the game doesn't stretch
      ${pkgs.wlr-randr}/bin/wlr-randr --output eDP-1 --off || true

      # Force the VGA monitor to be the primary screen at 0,0
      ${pkgs.wlr-randr}/bin/wlr-randr --output VGA-1 --on --pos 0,0 || true
    '';
  };

  # ===========================================================================
  # Boot Configuration
  # ===========================================================================
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Quiet boot for kiosk experience
  boot.kernelParams = [
    "quiet"
    "splash"
    "loglevel=3"
    "rd.systemd.show_status=false"
    "rd.udev.log_level=3"
    "udev.log_priority=3"
    "nvidia-drm.modeset=1"
    "apci_osi=!"
    "acpi_osi=\"Windows 2020\""
  ];

  boot.consoleLogLevel = 0;
  boot.initrd.verbose = false;

  # ===========================================================================
  # Time & Locale
  # ===========================================================================
  time.timeZone = "America/New_York";
  i18n.defaultLocale = "en_US.UTF-8";
  i18n.extraLocaleSettings = rcadeLib.defaultLocaleSettings;

  # ===========================================================================
  # Admin User (for SSH access and maintenance)
  # ===========================================================================
  users.users.admin = {
    isNormalUser = true;
    description = "RCade Admin";
    extraGroups = [ "networkmanager" "wheel" "docker" "video" "audio" "input" ];
    shell = pkgs.zsh;

    # SSH keys for maintainers
    openssh.authorizedKeys.keys = rcadeLib.allMaintainerKeys;

    password = "rcade";
  };

  # Allow admin user to use sudo without password (for remote maintenance)
  security.sudo.extraRules = [
    {
      users = [ "admin" ];
      commands = [
        { command = "ALL"; options = [ "NOPASSWD" ]; }
      ];
    }
  ];

  # ===========================================================================
  # SSH Server
  # ===========================================================================
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = false;  # Key-only authentication
    };
  };

  # ===========================================================================
  # System Packages
  # ===========================================================================
  environment.systemPackages = rcadeLib.baseSystemPackages pkgs ++ (with pkgs; [
    # Networking tools
    networkmanagerapplet

    # System monitoring
    lm_sensors
    pciutils
    usbutils

    # Shell
    zsh
  ]);

  # Programs
  programs.zsh.enable = true;
  programs.tailscale.enable = true;

  # ===========================================================================
  # Virtualization (optional - for running containers)
  # ===========================================================================
  virtualisation.docker.enable = true;

  # ===========================================================================
  # Unfree Packages
  # ===========================================================================
  nixpkgs.config.allowUnfree = true;

  # ===========================================================================
  # Home Manager Configuration
  # ===========================================================================
  home-manager.users.admin = { pkgs, ... }: {
    home.username = "admin";
    home.homeDirectory = "/home/admin";

    # Git configuration
    programs.git = {
      enable = true;
      settings = {
        user.name = "RCade Admin";
        user.email = "admin@rcade.local";
        init.defaultBranch = "main";
        pull.rebase = true;
        push.autoSetupRemote = true;
      };
    };

    # Zsh configuration
    programs.zsh = {
      enable = true;
      autosuggestion.enable = true;
      syntaxHighlighting.enable = true;

      shellAliases = {
        ll = "ls -la";
        rebuild = "sudo nixos-rebuild switch --flake /etc/nixos";
        update = "sudo nix flake update /etc/nixos";
      };
    };

    # Let Home Manager manage itself
    programs.home-manager.enable = true;

    home.stateVersion = "24.05";
  };

  # ===========================================================================
  # System State Version
  # ===========================================================================
  # This should match the NixOS version you initially installed
  # Do not change this unless you understand the implications
  system.stateVersion = "24.05";
}
