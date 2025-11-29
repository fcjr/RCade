# @rcade/sdk

TypeScript SDK for building RCade games and plugins.

## Installation

```bash
npm install @rcade/sdk
```

## Usage

```typescript
import { PluginChannel } from "@rcade/sdk";

const channel = await PluginChannel.acquire("@rcade/my-plugin", "1.0.0");
```

## Development

```bash
bun install
bun run build
```
