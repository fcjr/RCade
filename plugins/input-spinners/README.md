# @rcade/input-spinners

The cabinet side of the spinners. Games ask for `@rcade/input-spinners` by
version, and the cabinet gives them the newest version that fits:

| Version | Manifest | For | Gives |
|---|---|---|---|
| 1.x | `v1.manifest.json`, `v1.ts` | `@rcade/plugin-input-spinners` 0.2 (on npm) | `{type: "spinners", spinner1_step_delta, spinner2_step_delta}`, 64 steps per turn |
| 2.x | `v2.manifest.json`, `v2.ts` | `@rcade/plugin-input-spinners` 0.3 (`clients/`) | The T-Knob protocol, per player: ticks, curves, tare, rumble |

Both versions read the same knobs, through `knob/`. Only the newest client
lives in `clients/`; the old one stays published on npm.

## knob/: the shared spinners

`knob/hub.ts` is the cabinet's one connection to the T-Knobs, shared by every
plugin that uses them. The menu and a game can each be attached at once:

- **Everyone hears every knob.**
- **Only the newest attachment, the game in front, may change how they feel.**
  Its commands' replies go only to it.
- **A newcomer starts from the stock feel.** When the game in front leaves, the
  knobs are reset and braked for whoever is next; when the last one leaves,
  they're closed.
- **Each knob keeps its own lease alive**, every 200 ms. Without one for 500 ms,
  the firmware returns to stock by itself, so losing the cabinet can't leave a
  motor driven.

Knobs are found as Espressif USB `303a:1001` serial ports, and accepted only
after an `rcade-tknob` hello. A knob whose messages the cabinet can't
read is logged once: reflash it. The first one found is P1, the next P2.
To pin them, set `RCADE_TKNOB_P1` and `RCADE_TKNOB_P2` to knob IDs (the `id`
in hello, e.g. `40-4c-ca-5c-3c-24`). `RCADE_TKNOB_PORT` (comma-separated)
picks ports instead of searching. `RCADE_TKNOB_LOG` logs all traffic to a file.
The transport never toggles DTR/RTS, which resets the knob.

**TEMPORARY:** until both spinners are T-Knobs, a player without a knob gets
the old HID spinner (`knob/hid.ts`). It speaks the knob's messages: ticks as
it turns, working tare, and acks for everything that would change its feel.

Close the cabinet before using a knob from another program: a port can only be
open once. The firmware's wire format is
`firmware/knob/PROTOCOL.md`.

## v2: what games send

Each command names its `player` (1 or 2) and may carry an `id`, which its ack
or error echoes. Games may send `hello`, `config`, `tare`, `reset`, `brake`
and `rumble`. Everything is checked against the firmware's limits before it's
sent. `lease` never comes from a game.

## Native dependency packaging

`serialport` has a native addon, so it's external to the cabinet's esbuild
bundle, like `node-hid`. `nix/pkgs/cabinet.nix` copies both into the package's
`node_modules`, with only the linux-x64 prebuilds.

## Tests

- `pnpm --filter @rcade/input-spinners run check`
- `pnpm --filter @rcade/input-spinners run test`
- `pnpm --filter @rcade/plugin-input-spinners run build`

The tests use fake serial ports and a fake HID device. They never open a
physical device.
