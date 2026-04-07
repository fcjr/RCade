{
  config,
  lib,
  pkgs,
  ...
}:

let
  rcadeLib = import ../../nix/lib { inherit lib; };
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
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = rcadeLib.allMaintainerKeys;
  };

  # Passwordless sudo for wheel
  security.sudo.wheelNeedsPassword = false;

  # SSH
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "yes";
      PasswordAuthentication = true;
    };
  };

  # Tailscale
  services.tailscale.enable = true;

  # Nix flakes
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];

  system.stateVersion = "26.05";
}
