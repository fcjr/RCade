# Deploy NixOS configurations to machines via Tailscale

[doc('Deploy all machines')]
[group('deploy')]
deploy-all: deploy-marquee deploy-nuc

[doc('Deploy marquee (Raspberry Pi)')]
[group('deploy')]
deploy-marquee ip="100.123.178.9":
    nix --extra-experimental-features 'nix-command flakes' run nixpkgs#nixos-rebuild -- switch --flake .#rcade-marquee --target-host rcade@{{ ip }} --build-host rcade@{{ ip }} --sudo 

[doc('Deploy nuc (production cabinet)')]
[group('deploy')]
deploy-nuc ip="100.111.184.1":
    nix --extra-experimental-features 'nix-command flakes' run nixpkgs#nixos-rebuild -- switch --flake .#rcade-nuc --target-host rcade@{{ ip }} --build-host rcade@{{ ip }} --sudo

[doc('Build marquee SD card image (decrypts WiFi PSK from agenix)')]
[group('build')]
build-marquee-image:
    MARQUEE_WIFI_PSK=$(cd secrets && nix run github:ryantm/agenix -- -d wifi-psk.age 2>/dev/null | sed 's/^PSK=//') nix build .#packages.aarch64-linux.marquee-image --impure

[doc('Flash marquee image to a USB/SD drive')]
[group('build')]
flash-marquee-image:
    #!/usr/bin/env bash
    set -euo pipefail
    IMG=$(echo result/sd-image/*.img.zst)
    if [ ! -f "$IMG" ]; then
        echo "No image found. Run 'just build-marquee-image' first."
        exit 1
    fi
    echo "Available external drives:"
    echo "---"
    DRIVES=""
    for d in $(diskutil list external physical | grep "^/dev/disk" | awk '{print $1}' | sed 's|/dev/disk||'); do
        PROTO=$(diskutil info "/dev/disk${d}" | grep "Protocol:" | awk '{print $2}')
        if [ "$PROTO" = "USB" ] || [ "$PROTO" = "Secure" ]; then
            DRIVES="$DRIVES $d"
            diskutil info "/dev/disk${d}" | grep -E "Device Node|Media Name|Disk Size|Device / Media Name" | sed 's/^/  /'
            echo ""
        fi
    done
    DRIVES=$(echo "$DRIVES" | xargs)
    if [ -z "$DRIVES" ]; then
        echo "No USB/SD drives found. Insert a drive and try again."
        exit 1
    fi
    echo "---"
    echo ""
    DRIVE_COUNT=$(echo "$DRIVES" | wc -w | xargs)
    if [ "$DRIVE_COUNT" = "1" ]; then
        DISKNUM=$DRIVES
        echo "Found one drive: /dev/disk${DISKNUM}"
        read -p "Flash to this drive? [y/N]: " CONFIRM_DRIVE
        if [ "$CONFIRM_DRIVE" != "y" ] && [ "$CONFIRM_DRIVE" != "Y" ]; then
            echo "Aborted."
            exit 1
        fi
    else
        read -p "Enter disk number ($(echo $DRIVES | sed 's/ /, /g')): " DISKNUM
        if ! echo "$DRIVES" | tr ' ' '\n' | grep -qx "$DISKNUM"; then
            echo "Error: disk${DISKNUM} is not in the list."
            exit 1
        fi
    fi
    DISK="/dev/disk${DISKNUM}"
    RDISK="/dev/rdisk${DISKNUM}"
    echo ""
    echo "Will flash $IMG -> $RDISK"
    echo "⚠ ALL DATA ON $DISK WILL BE ERASED"
    read -p "Type YES to continue: " CONFIRM
    if [ "$CONFIRM" != "YES" ]; then
        echo "Aborted."
        exit 1
    fi
    echo "Decompressing image..."
    zstd -d "$IMG" -o /tmp/marquee.img -f
    echo "Unmounting $DISK..."
    diskutil unmountDisk "$DISK"
    echo "Flashing (this may take a few minutes)..."
    sudo dd if=/tmp/marquee.img of="$RDISK" bs=4m status=progress
    echo "Ejecting $DISK..."
    diskutil eject "$DISK"
    rm /tmp/marquee.img
    echo "Done! Drive is safe to remove."

# Manage agenix-encrypted secrets (see secrets/secrets.nix for key config)

[doc('Edit a secret by name')]
[group('secrets')]
edit-secret file:
    cd secrets && nix run github:ryantm/agenix -- -e {{ file }}.age

[doc('Edit the shared WiFi PSK')]
[group('secrets')]
edit-wifi-psk: (edit-secret "wifi-psk")

[doc('Edit cabinet API keys')]
[group('secrets')]
edit-cabinet-secrets: (edit-secret "cabinet-secrets-env")

[doc('Re-encrypt all secrets after adding/removing keys')]
[group('secrets')]
rekey:
    cd secrets && nix run github:ryantm/agenix -- -r
