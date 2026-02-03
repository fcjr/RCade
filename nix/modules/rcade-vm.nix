# RCade VM Configuration Module
#
# This module configures a NixOS VM for testing the cabinet.
# It sets up QEMU with virtio graphics, sound, and appropriate drivers.

{ config, lib, pkgs, modulesPath, ... }:

{
  imports = [
    (modulesPath + "/profiles/qemu-guest.nix")
  ];

  # VM-specific hardware
  boot.initrd.availableKernelModules = [ "virtio_pci" "virtio_blk" "virtio_net" ];
  boot.kernelModules = [ "virtio_gpu" ];

  # Use virtio GPU
  boot.kernelParams = [
    "console=tty0"
  ];

  # Filesystem (provided by QEMU)
  fileSystems."/" = {
    device = "/dev/vda";
    fsType = "ext4";
  };

  # No bootloader needed for direct kernel boot
  boot.loader.grub.enable = false;

  # Virtio graphics
  hardware.graphics = {
    enable = true;
  };

  # Sound via QEMU
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };
  services.pulseaudio.enable = false;

  # Networking
  networking.hostName = "rcade-vm";
  networking.useDHCP = true;

  # Test user with SSH key authentication
  users.users.rcade = {
    isNormalUser = true;
    extraGroups = [ "wheel" "video" "audio" ];
    # SSH keys for test access (uses maintainer keys from lib)
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKpmuAVPQUMOZhy+a/54Rh/vwbhx9j5HU2rnhyExw01r"  # rose
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGhBgDfImfTT4FQX6feRvOtkFJWPswFo7EG5VGjYDOs4"  # frank
    ];
  };

  security.sudo.wheelNeedsPassword = false;

  # Enable SSH for debugging (key-only, no passwords)
  services.openssh = {
    enable = true;
    settings = {
      PermitEmptyPasswords = false;
      PasswordAuthentication = false;
    };
  };

  # Nix settings
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.stateVersion = "24.05";
}
