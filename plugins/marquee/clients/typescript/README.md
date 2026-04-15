# @rcade/plugin-marquee

Drive the marquee RGB LED display from a game.

The marquee is a stack — the most recent game to call `take` is on top. When
your game exits, its entry is automatically dropped and the next game below
resumes where it left off.

## Installation

```bash
npm install @rcade/plugin-marquee
```

## API

### take(config)

Take the marquee display for this game.

```ts
import { take } from "@rcade/plugin-marquee";

const marquee = await take({ width: 128, height: 32 });
```

### marquee.apply(frame)

Push a frame. `frame` is a `Uint8Array` of `width * height * 3` bytes (raw RGB, row-major).

```ts
const frame = new Uint8Array(128 * 32 * 3);
// ...fill frame...
marquee.apply(frame);
```

### marquee.setBrightness(value)

Set display brightness. `value` is 0–255.

```ts
marquee.setBrightness(200);
```

## Development

```bash
pnpm install
pnpm run build
```