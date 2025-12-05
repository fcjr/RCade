# @rcade/plugin-input-spinners

Input plugin for RCade's spinner controls (rotary encoders).

## Installation

```bash
npm install @rcade/plugin-input-spinners
```

## Usage

Two patterns are available. Pick one, don't mix them.

### Polling (recommended)

```javascript
import { PLAYER_1, PLAYER_2 } from "@rcade/plugin-input-spinners";

function gameLoop() {
  // Returns accumulated movement since last read, then resets to 0
  const stepDelta = PLAYER_1.SPINNER.step_delta;
  paddleX += stepDelta * speed;

  requestAnimationFrame(gameLoop);
}
```

### Angle Tracking

```javascript
import { PLAYER_1 } from "@rcade/plugin-input-spinners";

function gameLoop() {
  // Get cumulative angle in radians (automatically updated)
  const angle = PLAYER_1.SPINNER.angle;
  knob.rotation = angle;

  requestAnimationFrame(gameLoop);
}

// Reset angle to 0 when needed
PLAYER_1.SPINNER.reset();
```

### Events

```javascript
import { on } from "@rcade/plugin-input-spinners";

on("spin", ({ player, step_delta, step_resolution }) => {
  console.log(`Player ${player} spun ${step_delta} steps`);
});
```

## API

### PLAYER_1 / PLAYER_2

```typescript
{
  SPINNER: {
    step_delta: number;
    step_resolution: number;
    angle: number;
    reset(): void;
  }
}
```

- `step_delta`: Accumulated movement since last read. Reading resets it to 0.
- `step_resolution`: Encoder resolution (x steps per rotation).
- `angle`: Cumulative angle in radians (automatically updated).
- `reset()`: Resets the angle to 0.

### STATUS

```typescript
{
  connected: boolean
}
```

### Events

#### on(event, callback)

Subscribe to spin events.

```typescript
const unsubscribe = on("spin", (data) => {
  // data: { player: 1 | 2, step_delta: number, step_resolution: number }
});

// Later: unsubscribe()
```

#### off(event, callback)

Unsubscribe from spin events.

#### once(event, [filter], [callback])

Listen for a single spin event. Supports filtering by player and both callback and Promise styles.

```typescript
// Promise style
const data = await once("spin");

// Promise with filter
const p1Data = await once("spin", { player: 1 });

// Callback style
const cancel = once("spin", (data) => { /* ... */ });
```

## Development

```bash
bun install
```
