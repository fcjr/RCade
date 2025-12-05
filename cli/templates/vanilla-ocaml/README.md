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
├── src/
│   ├── main.ml       # Game entry point
│   ├── style.css     # Styles
│   └── dune
├── ocaml-bindings/
│   └── ...           # Bindings to the input
├── index.html        # HTML entry
├── dune-project
└── package.json
```

## Arcade Controls

This template uses a binding to `@rcade/plugin-input-classic` for arcade input. See `ocaml-bindings/rcade.mli`.

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
