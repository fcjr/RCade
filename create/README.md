# create-rcade

Scaffold a new RCade game in seconds.

## Quick Start

```bash
npm create rcade@latest
```

That's it! Follow the prompts and you'll have a fully configured game project ready to deploy to the RCade arcade cabinet.

## What You Get

Running `create-rcade` sets up:

- A game project with your chosen template (JS, TS, or Rust)
- Build tooling pre-configured (Vite or Trunk)
- GitHub Actions workflow for automatic deployment
- `rcade.manifest.json` with your game metadata
- Git repository initialized and ready to push

## Interactive Prompts

```
? Enter game identifier (e.g. my-game): space-blaster
? Enter display name: Space Blaster
? Enter game description: An epic space shooter
? Game visibility: Public (Everyone can play!)
? Versioning: Automatic (version is incremented every push)
? Starting template: Vanilla (JavaScript)
? Package manager: npm
```

## Visibility Options

| Option | Who Can Play |
|--------|--------------|
| **Public** | Everyone |
| **Internal** | Recursers and people at the Hub |
| **Private** | Only you (great for development) |

## Templates

| Template | Tech Stack | Best For |
|----------|------------|----------|
| **Vanilla JS** | Vite + JavaScript | Quick prototypes |
| **Vanilla TS** | Vite + TypeScript | Type-safe development |
| **Vanilla Rust** | Trunk + WASM | Performance-critical games |

## After Creation

```bash
cd my-game
npm run dev      # Start local dev server
```

When you're ready to deploy:

```bash
git remote add origin git@github.com:you/my-game.git
git push -u origin main
```

GitHub Actions automatically builds and deploys your game to RCade!

## Development

This package is a thin wrapper around the `rcade` CLI package.

### Build

```bash
pnpm run build
```
