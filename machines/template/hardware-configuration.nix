# Hardware Configuration Template
#
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  WARNING: THIS IS A PLACEHOLDER - DO NOT USE DIRECTLY!                    ║
# ║                                                                           ║
# ║  This file MUST be replaced with your actual hardware configuration.      ║
# ║  Using this template will result in a non-bootable system.                ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# To generate the correct hardware configuration:
#
# Option 1: From NixOS installer
#   1. Boot the target machine with a NixOS installer USB
#   2. Run: nixos-generate-config --show-hardware-config
#   3. Replace this file with the output
#
# Option 2: From existing NixOS installation
#   nixos-generate-config --show-hardware-config > hardware-configuration.nix

{ config, lib, pkgs, modulesPath, ... }:

{
  imports = [
    (modulesPath + "/installer/scan/not-detected.nix")
  ];

  # ===========================================================================
  # PLACEHOLDER VALUES - Replace with output from nixos-generate-config
  # ===========================================================================

  boot.initrd.availableKernelModules = [
    "xhci_pci"
    "ahci"
    "nvme"
    "usb_storage"
    "sd_mod"
  ];

  boot.initrd.kernelModules = [ ];

  boot.kernelModules = [
    "kvm-intel"  # or "kvm-amd" for AMD CPUs
  ];

  boot.extraModulePackages = [ ];

  # ===========================================================================
  # Filesystems - MUST be configured for your specific disk layout
  # ===========================================================================
  # Example configuration (REPLACE WITH YOUR ACTUAL MOUNTS):

  # fileSystems."/" = {
  #   device = "/dev/disk/by-uuid/YOUR-ROOT-UUID-HERE";
  #   fsType = "ext4";
  # };

  # fileSystems."/boot" = {
  #   device = "/dev/disk/by-uuid/YOUR-BOOT-UUID-HERE";
  #   fsType = "vfat";
  #   options = [ "fmask=0077" "dmask=0077" ];
  # };

  # swapDevices = [
  #   { device = "/dev/disk/by-uuid/YOUR-SWAP-UUID-HERE"; }
  # ];

  # PLACEHOLDER: Uses tmpfs so evaluation works, but system won't persist data.
  # Replace this with your actual disk/partition configuration.
  fileSystems."/" = lib.mkDefault {
    device = "none";
    fsType = "tmpfs";
    options = [ "size=2G" "mode=755" ];
  };

  # Warning shown during nixos-rebuild to remind users to configure hardware
  warnings = [
    ''
      ╔════════════════════════════════════════════════════════════════════════╗
      ║  WARNING: hardware-configuration.nix is still using placeholder!       ║
      ║                                                                        ║
      ║  Replace machines/<your-machine>/hardware-configuration.nix with       ║
      ║  the output of: nixos-generate-config --show-hardware-config           ║
      ║                                                                        ║
      ║  The current config uses tmpfs - NO DATA WILL PERSIST ACROSS REBOOTS!  ║
      ╚════════════════════════════════════════════════════════════════════════╝
    ''
  ];

  # ===========================================================================
  # CPU & Hardware Detection
  # ===========================================================================
  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
  hardware.cpu.intel.updateMicrocode = lib.mkDefault config.hardware.enableRedistributableFirmware;

  # Enable firmware for common hardware
  hardware.enableRedistributableFirmware = true;
}
