# {{display_name}}

{{description}}

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

Install dependencies:

```bash
npm install
opam install . --deps-only --with-dev-setup
```

## Developing

Start the development server:

```bash
npm run dev
```

This launches Vite on port 5173 and connects to the RCade cabinet emulator.

Compile and watch your OCaml project:

```bash
dune build --watch
```

## Releasing

Just push to github. Don't forget to include the `<name>.opam` and `package-lock.json` files, as they are needed for the CI to run.

## Project Structure

```
├── public/           # Static assets (copied as-is)
├── src/
│   ├── main.ml       # Game entry point
│   ├── style.css     # Styles
│   └── dune
├── ocaml-bindings/
│   └── ...           # Bindings to the input
├── index.html        # HTML entry
├── vite.config.js    # Vite configuration
├── dune-project
└── package.json
```

## Adding Assets

**Imported assets** (recommended) - Import assets in a JS file and expose them globally, then access via Js_of_ocaml. Vite bundles these with hashed filenames for cache busting.

**Static assets** - Place in `public/` for files copied as-is. Access via root path (`/sprite.png`).

## Arcade Controls

This template uses a binding to `@rcade/plugin-input-classic` for arcade input. See `ocaml-bindings/rcade.mli`.

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
