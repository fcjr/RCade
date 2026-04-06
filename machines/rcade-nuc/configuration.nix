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

{
  config,
  pkgs,
  lib,
  inputs,
  self,
  ...
}:

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

  # Secrets
  age.secrets.cabinet-secrets-env.file = ../../secrets/cabinet-secrets-env.age;
  age.secrets.wifi-psk.file = ../../secrets/wifi-psk.age;

  # ===========================================================================
  # Machine Identity
  # ===========================================================================
  networking.hostName = "rcade-nuc"; # Change this for each machine
  networking.networkmanager.enable = true;
  networking.networkmanager.ensureProfiles = {
    environmentFiles = [ config.age.secrets.wifi-psk.path ];
    profiles.recurse-center = {
      connection = {
        id = "Recurse Center";
        type = "wifi";
      };
      wifi = {
        ssid = "Recurse Center";
        mode = "infrastructure";
      };
      wifi-security = {
        key-mgmt = "wpa-psk";
        psk = "$PSK";
      };
    };
  };
  services.tailscale.enable = true;

  # ===========================================================================
  # RCade Cabinet Service
  # ===========================================================================
  services.rcade-cabinet = {
    enable = true;

    # Secrets managed by agenix (decrypted at boot)
    environmentFile = config.age.secrets.cabinet-secrets-env.path;

    # Extra arguments for the cabinet app
    extraArgs = [ ];

    # Audio support (default: true)
    enableSound = true;

    # Vulkan/WebGPU support (default: true)
    enableVulkan = true;

    # Set audio volume to max on startup
    preLaunchCommands = ''
      # Wait for PipeWire sink to appear (up to 5 seconds)
      for i in $(seq 1 10); do
        if ${pkgs.wireplumber}/bin/wpctl get-volume @DEFAULT_AUDIO_SINK@ >/dev/null 2>&1; then
          ${pkgs.wireplumber}/bin/wpctl set-volume @DEFAULT_AUDIO_SINK@ 1.0
          break
        fi
        sleep 0.5
      done
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
    extraGroups = [
      "networkmanager"
      "wheel"
      "docker"
      "video"
      "audio"
      "input"
    ];
    shell = pkgs.zsh;

    # SSH keys for maintainers
    openssh.authorizedKeys.keys = rcadeLib.allMaintainerKeys;
  };

  # Allow admin user to use sudo without password (for remote maintenance)
  security.sudo.extraRules = [
    {
      users = [ "admin" ];
      commands = [
        {
          command = "ALL";
          options = [ "NOPASSWD" ];
        }
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
      PasswordAuthentication = false; # Key-only authentication
    };
  };

  # ===========================================================================
  # System Packages
  # ===========================================================================
  environment.systemPackages =
    rcadeLib.baseSystemPackages pkgs
    ++ (with pkgs; [
      # Networking tools
      networkmanagerapplet

      # System monitoring
      lm_sensors
      pciutils
      usbutils

      # Audio
      alsa-utils

      # Shell
      zsh
    ]);

  # Programs
  programs.zsh.enable = true;

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
  home-manager.users.admin =
    { pkgs, ... }:
    {
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
  # RTSP Stream (capture GUD display via kmsgrab)
  # ===========================================================================
  systemd.services.mediamtx = {
    description = "MediaMTX streaming server";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" ];
    serviceConfig = {
      ExecStart = "${pkgs.writeShellScript "mediamtx-launch" ''
        set -eu

        DEFAULT_IFACE="$(${pkgs.iproute2}/bin/ip -4 route show default | ${pkgs.gawk}/bin/awk 'NR == 1 { print $5 }')"
        if [ -z "$DEFAULT_IFACE" ]; then
          echo "No default IPv4 interface found for MediaMTX WebRTC host advertisement" >&2
          exit 1
        fi

        LAN_IP="$(${pkgs.iproute2}/bin/ip -4 -o addr show dev "$DEFAULT_IFACE" scope global | ${pkgs.gawk}/bin/awk 'NR == 1 { split($4, a, "/"); print a[1] }')"
        if [ -z "$LAN_IP" ]; then
          echo "No global IPv4 address found on interface $DEFAULT_IFACE" >&2
          exit 1
        fi

        export MTX_WEBRTCADDITIONALHOSTS="$LAN_IP"
        exec ${pkgs.mediamtx}/bin/mediamtx ${pkgs.writeText "mediamtx.yml" ''
        # RTSP remains the local ingest path from ffmpeg.
        # Remote viewers should connect with a browser over WebRTC:
        #   http://<cabinet-ip>:8889/stream
        webrtc: yes
        webrtcAddress: :8889
        webrtcLocalUDPAddress: :8189

        paths:
          all: {}
      ''}
      ''}";
      Restart = "always";
      RestartSec = 5;
    };
  };

  networking.networkmanager.dispatcherScripts = [
    {
      type = "basic";
      source = pkgs.writeText "restart-mediamtx-on-dhcp-change" ''
        if [ "$2" != "up" ] && [ "$2" != "dhcp4-change" ]; then
          exit 0
        fi

        ${pkgs.systemd}/bin/systemctl try-restart mediamtx.service
      '';
    }
  ];

  systemd.services.rtsp-capture = {
    description = "FFmpeg RTSP capture of GUD display";
    wantedBy = [ "multi-user.target" ];
    after = [ "mediamtx.service" "greetd.service" ];
    requires = [ "mediamtx.service" ];
    script = ''
      # Wait for greetd to start
      sleep 5

      # Find the GUD card dynamically
      GUD_CARD=""
      for i in $(seq 1 30); do
        for card in /sys/class/drm/card[0-9]; do
          driver=$(basename "$(readlink "$card/device/driver")" 2>/dev/null)
          if [ "$driver" = "gud" ]; then
            GUD_CARD="/dev/dri/$(basename "$card")"
            break 2
          fi
        done
        sleep 1
      done

      if [ -z "$GUD_CARD" ]; then
        echo "No GUD display found, exiting"
        exit 1
      fi

      echo "Capturing from $GUD_CARD"
      exec ${pkgs.ffmpeg}/bin/ffmpeg \
        -fflags nobuffer -flags low_delay \
        -framerate 60 \
        -f kmsgrab -device "$GUD_CARD" -i - \
        -vf 'hwdownload,format=bgr0' \
        -c:v libx264 -preset ultrafast -tune zerolatency \
        -pix_fmt yuv420p -profile:v baseline \
        -b:v 8M -maxrate 8M -bufsize 1M \
        -g 15 -keyint_min 15 -sc_threshold 0 -bf 0 \
        -x264-params "slice-max-size=1200:sync-lookahead=0:rc-lookahead=0" \
        -f rtsp -rtsp_transport udp rtsp://localhost:8554/stream
    '';
    serviceConfig = {
      Restart = "always";
      RestartSec = 5;
      SupplementaryGroups = [ "video" "render" ];
      AmbientCapabilities = [ "CAP_SYS_ADMIN" ];
    };
  };

  # ===========================================================================
  # Firewall
  # ===========================================================================
  networking.firewall.allowedTCPPorts = [ 22 8554 8889 ];
  networking.firewall.allowedUDPPorts = [ 8000 8001 8189 ];

  # ===========================================================================
  # System State Version
  # ===========================================================================
  # This should match the NixOS version you initially installed
  # Do not change this unless you understand the implications
  system.stateVersion = "24.05";
}
