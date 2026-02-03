# RCade Machine Configurations

This directory contains NixOS configurations for RCade arcade cabinets.

## Structure

```
machines/
  template/           # Template for new machines (copy this)
    configuration.nix # Main system configuration
    hardware-configuration.nix # Hardware-specific config (placeholder)

  # Add your machines here:
  # my-cabinet/
  #   configuration.nix
  #   hardware-configuration.nix
```

## Setting Up a New Cabinet

### 1. Copy the Template

```bash
cp -r machines/template machines/my-cabinet
```

### 2. Generate Hardware Configuration

Boot the target machine with a NixOS installer USB, then:

```bash
nixos-generate-config --show-hardware-config
```

Copy the output to replace `machines/my-cabinet/hardware-configuration.nix`.

### 3. Customize Configuration

Edit `machines/my-cabinet/configuration.nix`:

- Change `networking.hostName` to your machine name
- Update SSH keys if needed
- Configure any hardware-specific settings

### 4. Add to Flake

Add your machine to `flake.nix`:

```nix
nixosConfigurations = {
  # ... existing configs ...

  my-cabinet = nixpkgs.lib.nixosSystem {
    system = "x86_64-linux";
    specialArgs = { inherit inputs self; };
    modules = [
      ./machines/my-cabinet/configuration.nix
      home-manager.nixosModules.home-manager
      {
        home-manager.useGlobalPkgs = true;
        home-manager.useUserPackages = true;
        home-manager.extraSpecialArgs = { inherit inputs self; };
      }
    ];
  };
};
```

### 5. Deploy

From a machine with Nix installed:

```bash
# Build the configuration
nix build .#nixosConfigurations.my-cabinet.config.system.build.toplevel

# Deploy to remote machine
nixos-rebuild switch --flake .#my-cabinet --target-host admin@cabinet-ip
```

Or on the cabinet itself:

```bash
# Clone the repo
git clone https://github.com/your-org/rcade /etc/nixos

# Build and switch
nixos-rebuild switch --flake /etc/nixos#my-cabinet
```

## Secrets Management

Never commit secrets to the repository. Use one of these approaches:

### Environment File (Recommended)

Create `/etc/rcade/secrets.env` on the target machine:

```bash
CABINET_API_KEY=your-secret-key-here
```

Then reference it in your configuration:

```nix
services.rcade-cabinet = {
  enable = true;
  environmentFile = "/etc/rcade/secrets.env";
};
```

### Age/SOPS (Advanced)

For more sophisticated secret management, consider using [sops-nix](https://github.com/Mic92/sops-nix).

## Updating Cabinets

```bash
# Update flake inputs
nix flake update

# Rebuild remotely
nixos-rebuild switch --flake .#my-cabinet --target-host admin@cabinet-ip

# Or on the cabinet
ssh admin@cabinet-ip 'cd /etc/nixos && git pull && sudo nixos-rebuild switch --flake .'
```
