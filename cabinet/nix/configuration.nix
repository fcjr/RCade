{ config, pkgs, ... }:

{
  imports = [
    # Include hardware configuration - generate this with:
    # nixos-generate-config --show-hardware-config > hardware-configuration.nix
    ./hardware-configuration.nix
  ];

  # Bootloader
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;

  # Networking
  networking.hostName = "rcade";
  networking.networkmanager.enable = true;

  # Timezone and locale
  time.timeZone = "America/New_York";
  i18n.defaultLocale = "en_US.UTF-8";
  i18n.extraLocaleSettings = {
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

  # User account
  users.users.rcade = {
    isNormalUser = true;
    description = "rcade";
    extraGroups = [ "networkmanager" "wheel" "docker" ];
    shell = pkgs.zsh;
    # Set initial password - change this after first login
    initialPassword = "rcade";
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKpmuAVPQUMOZhy+a/54Rh/vwbhx9j5HU2rnhyExw01r" # Rose Kodsi-Hall
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGhBgDfImfTT4FQX6feRvOtkFJWPswFo7EG5VGjYDOs4" # Frank Chiarulli Jr.
    ]
  };

  # Allow unfree packages (for stuff like vscode, discord, etc.)
  nixpkgs.config.allowUnfree = true;

  # System packages
  environment.systemPackages = with pkgs; [
    vim
    wget
    curl
    git
    htop
    tmux
    zsh
    ripgrep
    fd
    bat
    exa
    fzf
  ];

  # Programs
  programs.zsh.enable = true;
  programs.git.enable = true;

  # Docker
  virtualisation.docker.enable = true;

  # SSH
  services.openssh = {
    enable = true;
    settings = {
      PermitRootLogin = "no";
      PasswordAuthentication = true;
    };
  };

  # Enable flakes
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  # Automatic garbage collection
  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 30d";
  };

  # System state version
  system.stateVersion = "24.05";
}
