# RCade Nix Configuration

This directory contains the NixOS and Nix Flake configuration for RCade.

## Structure

```
nix/
  modules/
    rcade-cabinet.nix   # NixOS module for the cabinet service
  pkgs/
    cabinet.nix         # Cabinet Electron app package
  lib/
    default.nix         # Shared utilities (SSH keys, helpers)
  README.md             # This file
  .gitignore            # Ignore build artifacts
```

## Flake Outputs

The root `flake.nix` provides:

### Development Shells

```bash
# Enter the development environment
nix develop

# Or with direnv (automatic)
cd /path/to/rcade  # .envrc activates automatically
```

The devshell includes:
- Rust toolchain (stable) via Fenix
- Bun runtime
- Node.js 22
- OpenSSL and build tools
- Linux-specific Electron dependencies

### NixOS Modules

```nix
# In your NixOS configuration
{
  imports = [ inputs.rcade.nixosModules.rcade-cabinet ];

  services.rcade-cabinet = {
    enable = true;
    # See module options below
  };
}
```

### Packages

```bash
# Build the cabinet package
nix build .#cabinet
```

### Machine Configurations

```bash
# Build a machine configuration
nix build .#nixosConfigurations.rcade-template.config.system.build.toplevel

# Deploy to a machine
nixos-rebuild switch --flake .#rcade-template --target-host admin@cabinet-ip
```

## RCade Cabinet Module

The `rcade-cabinet` module configures a NixOS system to run as an arcade cabinet.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enable` | bool | `false` | Enable the RCade cabinet service |
| `package` | package | `self.packages...cabinet` | The cabinet package to use |
| `user` | string | `"rcade"` | User account for the cabinet app |
| `apiKey` | string or null | `null` | API key (prefer `environmentFile`) |
| `environmentFile` | path or null | `null` | Path to secrets file |
| `extraArgs` | list of strings | `[]` | Extra CLI arguments |
| `autoLogin` | bool | `true` | Auto-login to kiosk |
| `enableSound` | bool | `true` | Enable PipeWire audio |
| `enableVulkan` | bool | `true` | Enable Vulkan graphics |
| `openFirewall` | bool | `false` | Open cabinet API ports |

### Example Configuration

```nix
services.rcade-cabinet = {
  enable = true;

  # Secrets (don't commit this!)
  environmentFile = "/etc/rcade/secrets.env";

  # Development mode
  extraArgs = [ "--dev" "--scale" "2" ];

  # Customize
  enableSound = true;
  enableVulkan = true;
};
```

## Development

### Testing the Flake

```bash
# Check the flake
nix flake check

# Show flake outputs
nix flake show

# Update dependencies
nix flake update
```

### Building a VM for Testing

```bash
# Build a VM image
nix build .#nixosConfigurations.rcade-template.config.system.build.vm

# Run the VM
./result/bin/run-rcade-vm
```

### Adding a New Machine

1. Copy the template: `cp -r machines/template machines/my-cabinet`
2. Generate hardware config on target machine
3. Add to `flake.nix` nixosConfigurations
4. Deploy with `nixos-rebuild`

See `machines/README.md` for detailed instructions.

## Architecture

```
                    flake.nix
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
   devShells      nixosModules    nixosConfigurations
        │               │               │
        │               ▼               │
        │     rcade-cabinet.nix         │
        │          │    │               │
        │          │    └───────────────┤
        │          ▼                    ▼
        │      cabinet.nix      machines/*/configuration.nix
        │                               │
        └───────────────────────────────┘
                        │
                        ▼
                   nix/lib/
              (shared utilities)
```

## References

- [Flakes - NixOS Wiki](https://nixos.wiki/wiki/Flakes)
- [Home Manager Manual](https://nix-community.github.io/home-manager/)
- [Determinate Systems - Nix Flakes Explained](https://determinate.systems/blog/nix-flakes-explained/)
