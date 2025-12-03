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
  const delta = PLAYER_1.SPINNER.delta;
  paddleX += delta * speed;

  requestAnimationFrame(gameLoop);
}
```

### Events

```javascript
import { on } from "@rcade/plugin-input-spinners";

on("spin", ({ player, delta }) => {
  console.log(`Player ${player} spun ${delta}`);
});
```

## API

### PLAYER_1 / PLAYER_2

```typescript
{
  SPINNER: { delta: number }
}
```

- `delta`: Accumulated movement since last read. Reading resets it to 0.

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
  // data: { player: 1 | 2, delta: number }
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
