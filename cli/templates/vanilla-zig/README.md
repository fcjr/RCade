# {{display_name}}

{{description}}

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Prerequisites

- [Zig 0.16.0](https://ziglang.org/download/#release-0.16.0)

## Testing

Start the development server:

```
zig build serve
```

You can pass arguments like this:

```
zig build serve -- -p 33121
```

### Running inside the cabinet shell

`zig build serve` only runs your game in a plain browser tab. To test it
the way it will actually run on the arcade — embedded in the cabinet shell,
talking to `@rcade/input-classic` over the plugin channel — run the rcade
cabinet against your dev server in another terminal:

```
zig build serve -- -p 33121 --no-open-browser
npx rcade@latest dev http://localhost:33121
```

The cabinet window will launch your game and forward real arcade input.

## Bundling Assets

Everything inside `assets/` is served by `zig build serve` and copied verbatim
into `dist/` by `zig build --release -p dist`. Drop sprites, fonts, JSON data,
audio, etc. into `assets/` and reference them from `main.js` with relative
URLs (e.g. `fetch("sprite.png")`). Subdirectories work too — `assets/img/foo.png`
becomes `/img/foo.png` at runtime.

A small `assets/sprite.png` ships with the template as a placeholder so you
can confirm the asset pipeline end-to-end.

## Development Build

```
zig build
```

Builds with debug symbols and assertions enabled. Output goes to `zig-out/`.

## Production Build

```
zig build --release -p dist
```

Builds an optimized production bundle. Output goes to `dist/` and is ready for deployment.

## Project Structure

```
├── assets/
│   ├── index.html    # HTML entry
│   └── main.js       # JS glue + plugin/keyboard input
├── src/
│   └── main.zig      # Game entry point (compiled to wasm)
├── tools/
│   └── serve.zig     # Dev server used by `zig build serve`
├── build.zig
└── build.zig.zon
```

## Arcade Controls

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
