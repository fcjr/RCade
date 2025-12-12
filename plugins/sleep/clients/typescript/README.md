# @rcade/plugin-sleep

Screensaver management plugin.

## Installation

```bash
npm install @rcade/plugin-sleep
```

## API

### preventSleep

Prevents the cabinet from falling asleep. Should be avoided in most cases to prevent burn-in on the CRT screen. 

```typescript
setInterval(() => preventSleep(), 1000);
```

### SCREENSAVER

#### updateScreensaver(config)
Update the screensaver config. Resets on exit to menu.
```ts
SCREENSAVER.updateScreensaver({
  transparent: true, // hides the background
  visible: true, // hides bouncing objects
})
```

#### addListener("started", callback) & addListener("stopped", callback)
Add event handlers for when the screensaver starts and stops. (when the user becomes or is no longer idle)

## Development

```bash
bun install
```
