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

Keyboard mapping for development:

| Action | Player 1 | Player 2 |
|--------|----------|----------|
| D-pad Up | W | Arrow Up |
| D-pad Down | S | Arrow Down |
| D-pad Left | A | Arrow Left |
| D-pad Right | D | Arrow Right |
| A Button | F | . |
| B Button | G | / |
| 1P Start | 1 | - |
| 2P Start | 2 | - |

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
