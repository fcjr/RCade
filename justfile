# Deploy NixOS configurations to machines via Tailscale

[group: 'deploy']
[doc: 'Deploy all machines']
deploy-all: deploy-marquee deploy-nuc

[group: 'deploy']
[doc: 'Deploy marquee (Raspberry Pi)']
deploy-marquee:
    nix run nixpkgs#nixos-rebuild -- switch --flake .#rcade-marquee --target-host rcade@100.123.178.9 --build-host rcade@100.123.178.9 --sudo

[group: 'deploy']
[doc: 'Deploy nuc (production cabinet)']
deploy-nuc:
    nix run nixpkgs#nixos-rebuild -- switch --flake .#rcade-nuc --target-host rcade@100.111.184.1 --build-host rcade@100.111.184.1 --sudo

# Manage agenix-encrypted secrets (see secrets/secrets.nix for key config)

[group: 'secrets']
[doc: 'Edit a secret by name']
edit-secret file:
    cd secrets && nix run github:ryantm/agenix -- -e {{file}}.age

[group: 'secrets']
[doc: 'Edit the shared WiFi PSK']
edit-wifi-psk: (edit-secret "wifi-psk")

[group: 'secrets']
[doc: 'Edit cabinet API keys']
edit-cabinet-secrets: (edit-secret "cabinet-secrets-env")

[group: 'secrets']
[doc: 'Re-encrypt all secrets after adding/removing keys']
rekey:
    cd secrets && nix run github:ryantm/agenix -- -r
