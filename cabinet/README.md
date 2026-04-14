# @rcade/cabinet

Electron desktop application that runs on the RCade arcade cabinet. Loads and runs games, handles input from arcade controls, and manages the game browser.

## Development

```bash
pnpm install
pnpm run dev
```

## Build

```bash
pnpm run build          # All platforms
pnpm run build:mac      # macOS
pnpm run build:win      # Windows
pnpm run build:linux    # Linux
```

## Raspberry Pi 5

For WebGPU support on Raspberry Pi 5, ensure Mesa Vulkan drivers are installed:

```bash
sudo apt install mesa-vulkan-drivers
```

For gamepad/input device support, install libudev-dev:

```bash
sudo apt install libudev-dev
```

## Architecture

- **Main process**: Game loading, plugin management, input handling
- **Renderer**: Svelte-based game browser and game runtime
- **Preload**: Secure bridge between main and renderer
