# @rcade/cabinet

Electron desktop application that runs on the RCade arcade cabinet. Loads and runs games, handles input from arcade controls, and manages the game browser.

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build          # All platforms
bun run build:mac      # macOS
bun run build:win      # Windows
bun run build:linux    # Linux
```

## Raspberry Pi 5

For WebGPU support on Raspberry Pi 5, ensure Mesa Vulkan drivers are installed:

```bash
sudo apt install mesa-vulkan-drivers
```

## Architecture

- **Main process**: Game loading, plugin management, input handling
- **Renderer**: Svelte-based game browser and game runtime
- **Preload**: Secure bridge between main and renderer
