{ config, pkgs, ... }:

{
  # Home Manager needs a bit of information about you and the paths it should manage
  home.username = "rcade";
  home.homeDirectory = "/home/rcade";

  # Packages to install for this user
  home.packages = with pkgs; [
    # Rust toolchain
    rustup
    cargo
    rustc
    rust-analyzer
    clippy
    rustfmt

    # C/C++ for Rust FFI and system programming
    gcc
    clang
    llvm
    cmake
    pkg-config
  
    # Development tools
    git
  ];

  # Git configuration
  programs.git = {
    enable = true;
    settings = {
      user.name = "RCade";
      user.email = "rose@hall.ly";
      init.defaultBranch = "main";
      pull.rebase = true;
      push.autoSetupRemote = true;
    };
  };

  # Let Home Manager manage itself
  programs.home-manager.enable = true;

  # This value determines the Home Manager release that your configuration is compatible with
  home.stateVersion = "24.05";
}
