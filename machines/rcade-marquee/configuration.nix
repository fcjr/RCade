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
  ];

  # Secrets
  age.secrets.wifi-psk.file = ../../secrets/wifi-psk.age;

  # Use the extlinux boot loader. (NixOS wants to enable GRUB by default)
  boot.loader.grub.enable = false;
  boot.loader.generic-extlinux-compatible.enable = true;

  networking.hostName = "rcade-marquee";

  # Wifi
  networking.wireless.enable = true;
  networking.wireless.networks."Recurse Center" = {
    pskRaw = "ext:PSK";
  };
  networking.wireless.secretsFile = config.age.secrets.wifi-psk.path;

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
