# Marquee Display Service

The `rcade-marquee` machine runs a systemd service that drives an RGB LED matrix panel via the GPIO header using the [`fcjr/rgbmatrix-rpi`](https://github.com/fcjr/rgbmatrix-rpi) Go library (a CGo binding to [`hzeller/rpi-rgb-led-matrix`](https://github.com/hzeller/rpi-rgb-led-matrix)).

The service exposes an RPC server on port 1234. Any client on the Tailscale network can connect and push frames — images, GIFs, or raw pixel data — to the display.

## Hardware

| Parameter | Value |
|---|---|
| GPIO mapping | `adafruit-hat` |
| Panel size | 32 rows × 64 cols |
| Chain length | 2 panels |
| Parallel | 1 |
| PWM bits | 11 |
| PWM LSB nanoseconds | 130 |
| Brightness | 50% |
| Scan mode | Progressive |
| Full resolution | 128 × 32 pixels |

## File layout

```
machines/rcade-marquee/
  configuration.nix       # systemd service declaration, GPIO permissions
  display/
    main.go               # Go server — initializes matrix, starts RPC listener
    go.mod                # module: rcade/marquee-display
    go.sum                # dependency lockfile (commit this, not vendor/)
  demo-client/
    main.go               # local demo CLI (fill / image / gif / webcam)
    go.mod                # module: rcade/marquee-demo-client (separate, not deployed)
    go.sum                # dependency lockfile

nix/pkgs/
  marquee-display.nix     # buildGoModule derivation (server only)
```

## RPC protocol

The server uses Go's built-in `net/rpc` over HTTP (not gRPC). The `rpc` sub-package from `fcjr/rgbmatrix-rpi` registers an `RPCMatrix` handler that exposes `Geometry`, `Apply`, and `Close`. The client module (`rcade/marquee-client`) implements the `Matrix` interface on top of this, so the library's `ToolKit` (GIF playback, image drawing) works the same as with real hardware.

## Building

The server package is built via `buildGoModule` using a fixed-output derivation for Go module dependencies — no `vendor/` directory is committed to the repo.

```nix
# nix/pkgs/marquee-display.nix
buildGoModule {
  src = ../../machines/rcade-marquee/display;
  vendorHash = "sha256-...";
}
```

The `vendorHash` covers the fetched module cache **including** the C headers injected by `overrideModAttrs` (see below). If you change `go.mod` dependencies, two hashes need updating in sequence:

1. Set **both** `rgbmatrixRpi.hash` and `vendorHash` to `lib.fakeHash` and deploy — the build fails on `rgbmatrixRpi.hash` first (it's a dependency of the vendor derivation). Copy the `got:` value.
2. Update `rgbmatrixRpi.hash`, deploy again — the build now fails on `vendorHash`. Copy the `got:` value.
3. Update `vendorHash` and deploy — succeeds.

**Why `overrideModAttrs`**: `go mod vendor` only copies files from Go package directories. `lib/rpi-rgb-led-matrix/include/` has no `.go` files, so `go mod vendor` silently skips it — but `matrix.go`'s CGo flags reference it via `${SRCDIR}/lib/rpi-rgb-led-matrix/include`. The `overrideModAttrs.postBuild` step copies those headers in after vendoring, before the hash is computed.

The package is referenced directly in `configuration.nix` via `callPackage` rather than exposed through the flake overlay, since it is only used by this machine.

The demo client module (`machines/rcade-marquee/demo-client`) is not built by Nix — run it locally with `go run`.

## GPIO access

The `adafruit-hat` mapping drives GPIO by memory-mapping the BCM2835 peripheral registers via `/dev/mem`. This requires:

1. **`CAP_SYS_RAWIO`** — granted to the service via `AmbientCapabilities` so it can access raw memory without running as root
2. **`gpio` group + udev rule** — `/dev/mem` is owned by the `gpio` group with mode `0660`, allowing the `rcade` user (a member of `gpio`) to open it

Runtime note: the C driver used by `fcjr/rgbmatrix-rpi` performs low-level `/dev/mem` access very early during initialization. On some Pi images and kernel configurations this can cause a segmentation fault when the process lacks root privileges, even if `CAP_SYS_RAWIO` or group permissions are configured. To avoid spurious SIGSEGVs during device init we currently start the service as `root` on the device and rely on the Go library's `DropPrivileges` option to relinquish privileges after hardware initialization completes.

Why this is temporary:
- Some C libraries perform privileged memory operations before user/group or capability checks can take effect; running as `root` prevents hard-to-debug crashes during that early phase.
- We minimize risk by asking the library to drop privileges after init (see `machines/rcade-marquee/display/main.go`).

Planned hardening options (future work):
- Ensure the udev rule and `gpio` group are applied and settled before the service starts (order the unit after `systemd-udev-settle.service`).
- Grant only the specific capability (`CAP_SYS_RAWIO`) and use `DeviceAllow` for `/dev/mem` so the service can run as `rcade` without full root.
- Move privileged setup into a tiny, auditable root helper that performs the `/dev/mem` setup and then execs the service as `rcade`.

For now we keep the temporary root startup + privilege drop approach until udev/capability behavior is confirmed across target Pi images.

## Deployment

```sh
just deploy-marquee
```

This SSHes into the Pi over Tailscale, builds the NixOS configuration on the Pi itself (`--build-host`), and switches to it atomically. If the build fails, the running system is unchanged.

To check the service after deploying:

```sh
ssh rcade@100.123.178.9
systemctl status marquee-display
journalctl -u marquee-display -f
```

To test the restart behavior:

```sh
systemctl kill marquee-display   # service restarts within 5 seconds
```

## Demo client

A local CLI for pushing content to the display over Tailscale. Run locally — it is not deployed to the Pi.

```sh
cd machines/rcade-marquee/demo-client

go run . fill FF0000               # solid red, holds until Ctrl-C
go run . fill 000000               # clear (black)
go run . image ~/photo.jpg         # PNG or JPEG, letterboxed to 128×32
go run . gif ~/animation.gif       # animated GIF, loops until Ctrl-C
go run . webcam                    # live webcam feed at ~5 fps, until Ctrl-C
```

The `--addr` flag overrides the default Pi address (`100.123.178.9:1234`):

```sh
go run . --addr localhost:1234 fill 00FF00
```

The webcam subcommand requires `ffmpeg` (`brew install ffmpeg`). It captures raw RGBA frames via `avfoundation` and streams them directly to the display at ~5 fps, letterboxed to preserve aspect ratio.

## Updating the display program

Edit `machines/rcade-marquee/display/main.go`, then deploy. The Pi compiles the Go binary natively (aarch64) — no cross-compilation setup required.

If you add or change Go dependencies, run `go mod tidy` locally to update `go.sum`, then update `vendorHash` in `nix/pkgs/marquee-display.nix` as described above.

## Rollback

NixOS keeps previous generations. If a deploy causes problems:

```sh
ssh rcade@100.123.178.9
sudo nixos-rebuild switch --rollback
```

Previous generations are also selectable from the extlinux boot menu on reboot.
