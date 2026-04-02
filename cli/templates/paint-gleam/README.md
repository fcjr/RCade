# {{display_name}}

{{description}}

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

Install dependencies:

```bash
bun install
gleam deps download
```

Start the development server:

```bash
gleam run -m lustre/dev start
```

## Building

```bash
gleam run -m lustre/dev build app
```

Output goes to `dist/` and is ready for deployment.

## Project Structure

```
├── assets/
│   └── style.css     # Styles
├── src/
│   ├── game.gleam    # Main Lustre application
│   └── window_ffi.mjs # JS FFI for window dimensions
├── test/
│   └── game_test.gleam
├── gleam.toml        # Gleam project configuration
└── package.json      # npm dependencies (RCade plugins)
```

## Gleam + Lustre + Paint Basics

This template uses [Lustre](https://hexdocs.pm/lustre/) as the UI framework and [Paint](https://hexdocs.pm/paint/) for vector graphics, both written in Gleam.

The app follows the Model-View-Update pattern:

```gleam
// Model holds your game state
type Model {
  Model(n: Int, offset_x: Float, offset_y: Float)
}

// Messages represent events
type Msg {
  Incr
  Controls(p1: Player1Inputs, p2: Player2Inputs)
}

// Update transforms model based on messages
fn update(model: Model, msg: Msg) { ... }

// View renders the model using Paint graphics
fn view(model: Model) { ... }
```

## Arcade Controls

This template uses the `rcade_inputs` package for easy access to arcade input:

```gleam
import rcade/inputs.{type Player1Inputs, type Player2Inputs}
import rcade/inputs/controls.{type Controls}

// Poll inputs at 60fps
inputs.poll(every: 16, with: fn(p1, p2, _system) { Controls(p1, p2) })

// D-pad
case state.left, state.right {
  True, False -> // moving left
  False, True -> // moving right
  _, _ -> // idle
}

// Spinners
let spin_delta = p1.spinner.step_delta + p2.spinner.step_delta
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
