# RCade

**Build games. Push to GitHub. Play on a real arcade machine.**

RCade is a custom-built arcade cabinet at [The Recurse Center](https://recurse.com) that runs games made by the community. This repo contains everything you need to create, deploy, and play your own arcade games.

---

## Create Your First Game in 60 Seconds

```bash
npm create rcade@latest
```

That's it. Answer a few questions, and you'll have a fully configured game project with automatic deployment to the arcade cabinet.

```sh
? Enter game identifier (e.g. my-game): space-blaster
? Enter display name: Space Blaster
? Enter game description: An epic space shooter
? Game visibility: Public (Everyone can play!)
? Versioning: Automatic (version is incremented every push)
? Starting template: Vanilla (JavaScript)
? Package manager: npm
```

Your game is now ready. Push to GitHub and it deploys automatically.

---

## How It Works

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Create    │────>│    Push     │────>│    Play!    │
│  your game  │     │  to GitHub  │     │  on RCade   │
└─────────────┘     └─────────────┘     └─────────────┘
```

1. **Create** - Run `npm create rcade@latest` to scaffold a new game
2. **Build** - Write your game using JavaScript, TypeScript, or Rust
3. **Push** - Push to the `main` branch on GitHub
4. **Deploy** - GitHub Actions automatically builds and deploys to RCade
5. **Play** - Your game appears on the arcade cabinet!

No servers to configure. No deployment scripts to write. No secrets to manage.

---

## Zero-Config Deployment

When you create a game, RCade automatically sets up a GitHub Actions workflow that:

- Triggers on every push to `main`
- Builds your game
- Deploys it to the RCade cabinet

Here's what gets generated in `.github/workflows/deploy.yaml`:

```yaml
name: Deploy to RCade

on:
  push:
    branches:
      - main

jobs:
  build-and-deploy:
    name: Build and Deploy to RCade
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      # Build steps (auto-configured for your package manager)

      - name: Deploy to RCade
        uses: fcjr/rcade/action-deploy@main
```

**No secrets required!** RCade uses GitHub's OIDC tokens for secure, passwordless authentication. After verifying your GitHub identity, RCade checks that your GitHub account is linked to your Recurse Center profile.

### Deployment Failing?

If your deployment fails with an authentication error, you need to link your GitHub account to your RC profile:

1. Go to [recurse.com/settings/general](https://www.recurse.com/settings/general)
2. Add your GitHub username to your profile
3. Re-run the failed GitHub Action

---

## Game Templates

Choose your weapon:

| Template | Best For |
|----------|----------|
| **Vanilla JavaScript** | Quick prototypes, simple games |
| **Vanilla TypeScript** | Type-safe development, larger projects |
| **p5.js** | Creative coding, visual games, animations |
| **p5.js + TypeScript** | Creative coding with type safety |
| **Vanilla Rust** | Performance-critical games, WASM enthusiasts |

All templates come pre-configured with:
- Hot module reloading for fast development
- Optimized production builds
- Automatic GitHub Actions deployment

---

## Using Arcade Controls

RCade has physical arcade controls: two joysticks, buttons for each player, and system buttons. Use the `@rcade/plugin-input-classic` plugin to read them:

```javascript
import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";

function gameLoop() {
  // D-pad directions
  if (PLAYER_1.DPAD.up) moveUp();
  if (PLAYER_1.DPAD.down) moveDown();
  if (PLAYER_1.DPAD.left) moveLeft();
  if (PLAYER_1.DPAD.right) moveRight();

  // Action buttons
  if (PLAYER_1.A) fire();
  if (PLAYER_1.B) jump();

  // System buttons
  if (SYSTEM.ONE_PLAYER) startOnePlayerGame();
  if (SYSTEM.TWO_PLAYER) startTwoPlayerGame();

  requestAnimationFrame(gameLoop);
}
```

The plugin is automatically included in your `rcade.manifest.json`:

```json
{
  "dependencies": [
    { "name": "@rcade/input-classic", "version": "1.0.0" }
  ]
}
```

---

## The Sandbox: What Your Game Can (and Can't) Do

RCade games run in a **constrained sandbox environment**. This keeps the arcade cabinet secure while running community-created games. Here's what you need to know:

### What's Blocked

| Capability | Status | Alternative |
|------------|--------|-------------|
| **Network requests** | Blocked | Games cannot fetch external URLs |
| **Local storage** | Blocked | No `localStorage`, `sessionStorage`, `indexedDB`, or cookies |
| **Direct input events** | Blocked | Use `@rcade/plugin-input-classic` instead |
| **Node.js APIs** | Blocked | Games run in browser context only |
| **File system access** | Blocked | Bundle all assets with your game |

**Coming soon:** We're planning to add plugins for persistence (save high scores!) and networking (multiplayer!). Want to help build them? Reach out to the RCade maintainers.

### Why Plugins?

Since direct browser APIs for input are blocked, **all system interactions happen through plugins**. Plugins provide a safe, structured way for games to access hardware and system features.

```javascript
// This WON'T work - direct input is blocked
document.addEventListener('keydown', handleKey);  // Throws SecurityError

// This WILL work - use the plugin
import { PLAYER_1 } from "@rcade/plugin-input-classic";
if (PLAYER_1.A) fire();
```

Plugins communicate with your game through message channels, ensuring games can only access explicitly granted capabilities.

### What Works Fine

- **Canvas rendering** - Draw anything you want
- **Audio** - Play sounds and music
- **Web Workers** - For background processing
- **requestAnimationFrame** - For smooth game loops
- **All your bundled assets** - Images, fonts, JSON data

### Designing for the Sandbox

1. **Bundle everything** - Include all assets in your build. No external CDNs.
2. **No persistence** - Games start fresh every time. Design for it.
3. **Use plugins for input** - The `@rcade/plugin-input-classic` plugin handles all arcade controls.
4. **Keep it self-contained** - Your game should work completely offline.

---

## The Manifest File

Every RCade game has an `rcade.manifest.json` that describes your game:

```json
{
  "$schema": "https://rcade.dev/manifest.schema.json",
  "name": "space-blaster",
  "display_name": "Space Blaster",
  "description": "An epic space shooter",
  "visibility": "public",
  "authors": { "display_name": "Your Name" },
  "dependencies": [
    { "name": "@rcade/input-classic", "version": "1.0.0" }
  ]
}
```

### Visibility Options

| Visibility | Who Can Play |
|------------|--------------|
| `public` | Everyone! |
| `internal` | Recursers and people at the Hub |
| `private` | Only you (great for development) |

### Versioning

- **Automatic** (default): Version increments with every push
- **Manual**: Add `"version": "1.0.0"` to control it yourself

---

## Development Workflow

### Local Development

```bash
cd my-game
npm run dev    # or: bun dev, pnpm dev
```

This starts a local development server with hot reloading. Make changes and see them instantly.

### Deploy to RCade

First, create a new repository on GitHub:

1. Go to [github.com/new](https://github.com/new)
2. Create a new repository (can be public or private)
3. **Don't** initialize it with a README, .gitignore, or license

Then connect your local project to GitHub and push:

```bash
git remote add origin git@github.com:YOUR_USERNAME/YOUR_REPO.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

That's it. GitHub Actions handles the rest. Watch the Actions tab to see your deployment progress.

### Check Your Game

Once deployed, your game will appear in the RCade game browser. Head to the arcade cabinet at RC to play it!

---

## Project Structure

```
my-game/
├── .github/
│   └── workflows/
│       └── deploy.yaml      # Auto-generated deployment workflow
├── src/
│   └── main.js              # Your game code
├── index.html               # Entry point
├── package.json             # Dependencies
└── rcade.manifest.json      # Game metadata
```

---

## Tips for Great Arcade Games

1. **Design for the controls** - You have a joystick and two buttons per player. Keep it simple and satisfying.

2. **Big, bold visuals** - The cabinet has a large screen. Use big sprites, thick lines, and high contrast.

3. **Quick sessions** - Arcade games should be pick-up-and-play. Get players into the action fast.

4. **Two-player support** - The cabinet has controls for two players. Multiplayer games are a hit!

5. **Sound effects** - Add audio feedback for actions. It makes the game feel alive.

---

## Repository Structure

This monorepo contains:

| Package | Description |
|---------|-------------|
| `cli/` | The `rcade` CLI for creating and managing games |
| `create/` | The `create-rcade` scaffolding tool |
| `action-deploy/` | GitHub Action for deploying games |
| `cabinet/` | Electron app running on the arcade machine |
| `web/` | SvelteKit web app for browsing games |
| `api/` | Shared API types and Zod schemas |
| `sdk/` | SDKs for game development (TypeScript and Rust) |
| `plugins/` | Input and system plugins (e.g., `input-classic`) |
| `runtime/` | Game runtime environment for plugin loading |

---

## Community Games

Looking for inspiration? Check out the [rcade-community](https://github.com/rcade-community) archive—a collection of games created by the Recurse Center community.

Found a game you'd like to build on? Use `remix` to create your own version:

```bash
npx rcade@latest remix <game-name>
```

---

## Get Started Now

```bash
npm create rcade@latest
```

Build something fun. See it running on a real arcade machine. Share it with the RC community.

**Happy hacking!**
