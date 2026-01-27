# {{display_name}}

{{description}}

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

This launches Vite on port 5173 and connects to the RCade cabinet emulator.

## Building

```bash
npm run build
```

Output goes to `dist/` and is ready for deployment.

## Project Structure

```
├── public/           # Static assets (copied as-is)
├── src/
│   ├── game.py       # Pygame game code
│   ├── main.js       # JavaScript entry point
│   └── style.css     # Styles
├── index.html        # HTML entry
├── vite.config.js    # Vite config with wheel bundling
├── rcade.manifest.json  # RCade game metadata
└── package.json
```

## Adding Assets

**Imported assets** (recommended) - Place in `src/` and import them in `src/main.js`. Vite bundles these with hashed filenames for cache busting:

```js
import spriteUrl from './sprite.png';
import jumpSound from './jump.wav';

// Pass asset URLs to Python via globalThis
globalThis.assets = { spriteUrl, jumpSound };
```

Then access them in Python:

```python
from js import assets

sprite = pygame.image.load(assets.spriteUrl)
sound = pygame.mixer.Sound(assets.jumpSound)
```

**Static assets** - Place in `public/` for files copied as-is. Access via root path (`/sprite.png`).

## Adding Python Dependencies

Add dependencies to the PEP 723 script metadata in `src/game.py`:

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pygame-ce",
#     "numpy",
# ]
# ///
```

The build system automatically downloads wheels from the [Pyodide package index](https://pyodide.org/en/stable/usage/packages-in-pyodide.html). Only packages available in Pyodide are supported.

## Arcade Controls

This template uses `@rcade/plugin-input-classic` for arcade input:

```python
inputs = _get_input().to_py()

# Player 1
if inputs["p1"]["up"]: ...
if inputs["p1"]["down"]: ...
if inputs["p1"]["left"]: ...
if inputs["p1"]["right"]: ...
if inputs["p1"]["a"]: ...
if inputs["p1"]["b"]: ...

# Player 2
if inputs["p2"]["up"]: ...
if inputs["p2"]["a"]: ...
# ... same structure as p1

# System
if inputs["system"]["start_1p"]: ...
if inputs["system"]["start_2p"]: ...
```

### Development Keyboard Controls

When developing locally, keyboard inputs are mapped to arcade controls:

**Classic Controls (`@rcade/plugin-input-classic`)**

| Player   | Action           | Key |
|----------|------------------|-----|
| Player 1 | UP               | W   |
| Player 1 | DOWN             | S   |
| Player 1 | LEFT             | A   |
| Player 1 | RIGHT            | D   |
| Player 1 | A Button         | F   |
| Player 1 | B Button         | G   |
| Player 2 | UP               | I   |
| Player 2 | DOWN             | K   |
| Player 2 | LEFT             | J   |
| Player 2 | RIGHT            | L   |
| Player 2 | A Button         | ;   |
| Player 2 | B Button         | '   |
| System   | One Player Start | 1   |
| System   | Two Player Start | 2   |

**Spinner Controls (`@rcade/plugin-input-spinners`)**

| Player   | Action        | Key |
|----------|---------------|-----|
| Player 1 | Spinner Left  | C   |
| Player 1 | Spinner Right | V   |
| Player 2 | Spinner Left  | .   |
| Player 2 | Spinner Right | /   |

Spinners repeat at ~60Hz while held.

To add spinner support: `npm install @rcade/plugin-input-spinners`

## Deployment

First, create a new repository on GitHub:

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (can be public or private)
3. **Don't** initialize it with a README, .gitignore, or license

Then connect your local project and push:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

The included GitHub Actions workflow will automatically deploy to RCade.

---

Made with <3 at [The Recurse Center](https://recurse.com)
