{
  config,
  lib,
  pkgs,
  ...
}:

let
  rcadeLib = import ../../nix/lib { inherit lib; };
  marqueeDisplay = pkgs.callPackage ../../nix/pkgs/marquee-display.nix { };
in
{
  imports = [
    ./hardware-configuration.nix
    ./wifi.nix
  ];

  # Use the extlinux boot loader. (NixOS wants to enable GRUB by default)
  boot.loader.grub.enable = false;
  boot.loader.generic-extlinux-compatible.enable = true;

  # Broadcom WiFi stability tweaks for RPi 4
  boot.kernelParams = [
    "brcmfmac.roamoff=1"
    "brcmfmac.feature_disable=0x282000"
  ];

  networking.hostName = "rcade-marquee";
  networking.wireless.enable = true;

  # Users
  users.users.rcade = {
    isNormalUser = true;
    extraGroups = [
      "wheel"
      "gpio"
    ];
    openssh.authorizedKeys.keys = rcadeLib.allMaintainerKeys;
  };

  # GPIO group for /dev/mem access (required by rpi-rgb-led-matrix adafruit-hat mapping)
  users.groups.gpio = { };
  services.udev.extraRules = ''
    KERNEL=="mem", GROUP="gpio", MODE="0660"
  '';

  # Passwordless sudo for wheel
  security.sudo.wheelNeedsPassword = false;

  # Allow admin user to use sudo without password (for remote maintenance)
  security.sudo.extraRules = [
    {
      users = [ "rcade" ];
      commands = [
        {
          command = "ALL";
          options = [ "NOPASSWD" ];
        }
      ];
    }
  ];

  # SSH
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = false;
    };
  };

  # Tailscale
  services.tailscale.enable = true;

  # RGB LED matrix marquee display
  systemd.services.marquee-display = {
    description = "RCade RGB LED matrix marquee display";
    wantedBy = [ "multi-user.target" ];
    after = [ "network.target" ];
    serviceConfig = {
      ExecStart = "${marqueeDisplay}/bin/marquee-display";
      User = "root";
      Restart = "on-failure";
      RestartSec = 5;
      AmbientCapabilities = [ "CAP_SYS_RAWIO" ];
    };
  };

  # Nix flakes
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];

  system.stateVersion = "26.05";
}
