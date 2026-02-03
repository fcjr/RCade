# RCade Nix Library
#
# Shared utilities and helpers for RCade Nix configurations.

{ lib }:

let
  # Known SSH keys for RCade maintainers
  # Add your key here when setting up a new cabinet
  sshKeys = {
    "rose" = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKpmuAVPQUMOZhy+a/54Rh/vwbhx9j5HU2rnhyExw01r";
    "frank" = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGhBgDfImfTT4FQX6feRvOtkFJWPswFo7EG5VGjYDOs4";
  };
in
{
  # =========================================================================
  # SSH Key Management
  # =========================================================================

  inherit sshKeys;

  # Get all maintainer SSH keys as a list
  allMaintainerKeys = builtins.attrValues sshKeys;

  # =========================================================================
  # Machine Configuration Helpers
  # =========================================================================

  # Standard locale settings for RCade cabinets
  defaultLocaleSettings = {
    LC_ADDRESS = "en_US.UTF-8";
    LC_IDENTIFICATION = "en_US.UTF-8";
    LC_MEASUREMENT = "en_US.UTF-8";
    LC_MONETARY = "en_US.UTF-8";
    LC_NAME = "en_US.UTF-8";
    LC_NUMERIC = "en_US.UTF-8";
    LC_PAPER = "en_US.UTF-8";
    LC_TELEPHONE = "en_US.UTF-8";
    LC_TIME = "en_US.UTF-8";
  };

  # =========================================================================
  # Package Sets
  # =========================================================================

  # Standard packages for all RCade machines
  baseSystemPackages = pkgs: with pkgs; [
    vim
    wget
    curl
    git
    htop
    tmux
    ripgrep
    fd
    bat
    fzf
  ];

  # Development packages for machines with dev access
  devSystemPackages = pkgs: with pkgs; [
    cargo
    rustc
    rust-analyzer
    clippy
    rustfmt
    clang
    llvm
    cmake
    pkg-config
  ];
}
