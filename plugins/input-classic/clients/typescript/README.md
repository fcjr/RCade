# @rcade/plugin-input-classic

Input plugin for RCade's classic arcade controls (joysticks and buttons).

## Installation

```bash
npm install @rcade/plugin-input-classic
```

## Usage

```javascript
import { PLAYER_1, PLAYER_2, SYSTEM } from "@rcade/plugin-input-classic";

function gameLoop() {
  if (PLAYER_1.DPAD.up) moveUp();
  if (PLAYER_1.A) fire();
  if (SYSTEM.ONE_PLAYER) startGame();

  requestAnimationFrame(gameLoop);
}
```

## API

### PLAYER_1 / PLAYER_2

```typescript
{
  DPAD: { up: boolean, down: boolean, left: boolean, right: boolean },
  A: boolean,
  B: boolean
}
```

### SYSTEM

```typescript
{
  ONE_PLAYER: boolean,
  TWO_PLAYER: boolean
}
```

## Development

```bash
bun install
```
