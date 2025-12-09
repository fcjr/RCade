# rcade

The RCade CLI for creating and managing arcade games.

## Installation

```bash
npm install -g rcade
```

Or use directly without installing:

```bash
npm create rcade@latest
```

## What It Does

The `rcade` CLI scaffolds new game projects with everything you need:

- Game templates (JavaScript, TypeScript, or Rust)
- Pre-configured build tooling (Vite or Trunk)
- Auto-generated GitHub Actions workflow for deployment
- `rcade.manifest.json` for game metadata
- Git repository initialization

## Usage

### Create a New Game

Run the create command and follow the interactive prompts:

```bash
npm create rcade@latest
```

You'll be asked for:

| Prompt | Description |
|--------|-------------|
| **Game identifier** | URL-safe name (e.g., `space-blaster`) |
| **Display name** | Human-readable name (e.g., `Space Blaster`) |
| **Description** | Short description of your game |
| **Visibility** | `public`, `internal`, or `private` |
| **Versioning** | `automatic` (recommended) or `manual` |
| **Template** | JavaScript, TypeScript, or Rust |
| **Package manager** | npm, pnpm, or bun |

### Remix an Existing Game

Want to build on a game from the [rcade-community](https://github.com/rcade-community) archive? Use the remix command:

```bash
npx rcade@latest remix <game-name>
```

This clones the game and sets it up as a new project for you to modify.

### Developing on a Fork

If you fork an existing RCade game repository on GitHub, you'll need to rename your game to avoid conflicts with the original. Each game name can only be registered to one repository.

Edit `rcade.manifest.json` and change the `name` field:

```json
{
  "name": "original-game-yourname",
  ...
}
```

### Local Development with the Cabinet

Test your game in the actual rcade cabinet environment:

```bash
npx rcade@latest dev <server-url>
```

For example, if your game is running on `http://localhost:5173`:

```bash
npx rcade@latest dev http://localhost:5173
```

This downloads and launches the rcade cabinet application, loading your game from the local dev server. Options:

| Option | Description |
|--------|-------------|
| `-v, --version <version>` | Use a specific cabinet version |
| `--force-download` | Force re-download of the cabinet binary |
| `--scale <factor>` | Scale factor for the window (default: 2) |

### Manage Cabinet Cache

The cabinet binary is cached locally. Manage it with:

```bash
npx rcade@latest cache list    # List cached versions
npx rcade@latest cache clear   # Clear all cached versions
npx rcade@latest cache dir     # Print the cache directory path
```

## Templates

### Vanilla JavaScript
Basic Vite setup with vanilla JavaScript. Best for quick prototypes.

### Vanilla TypeScript
Vite setup with TypeScript. Best for larger projects that benefit from type safety.

### p5.js
Vite setup with [p5.js](https://p5js.org/) for creative coding. Great for visual games and animations with an easy-to-use drawing API.

### p5.js + TypeScript
p5.js with TypeScript support. Combines creative coding with type safety.

### Vanilla Rust
Trunk setup compiling Rust to WebAssembly. Best for performance-critical games.

## Generated Files

```
my-game/
├── .github/
│   └── workflows/
│       └── deploy.yaml      # Auto-deployment to RCade
├── public/                  # Static assets (images, audio, fonts)
├── src/
│   └── main.js              # Your game code
├── index.html               # Entry point
├── vite.config.js           # Vite configuration
├── package.json             # Dependencies
└── rcade.manifest.json      # Game metadata
```

## Adding Assets

**Imported assets** (recommended) - Place in `src/` and import them. Vite bundles these with hashed filenames for cache busting:

```js
import spriteUrl from './sprite.png';
import jumpSound from './jump.mp3';

const img = new Image();
img.src = spriteUrl;

const sound = new Audio(jumpSound);
sound.play();
```

**Static assets** - Place in `public/` for files copied as-is without processing. Access via root path:

```js
const img = new Image();
img.src = '/sprite.png';
```

See each template's README for language-specific examples.

## Development

### Prerequisites

- [Bun](https://bun.sh) runtime

### Setup

```bash
bun install
```

### Build

```bash
bun run build
```

This outputs the CLI to `dist/index.js`.

### Local Testing

```bash
bun run src/index.ts
```
