# T-Knob protocol

USB serial (VID 303a, PID 1001), one JSON object per line, newline-terminated,
at most 65536 bytes. Every number is an integer. The clients convert to and from
degrees and 0..1; this is what's on the wire.

## Units

- **Angles** count 1/65536 turn.
  - `angle` is the encoder within one turn, 0..65535.
  - `global_angle` and curve x are `i64` and keep counting turns.
- **Values** for mass, tension and friction are 1/65536 fractions: 0..65535,
  where 32768 is exactly one half.
- **`_q16`** fields are the `i32` bits of a number with 16 fractional bits.
  Velocities are turns/s; tuning fields use `tuning.toml`'s units.

## The global angle

At boot the global angle equals the encoder angle, and it counts every turn from
then on. `tare` sets it. The encoder `angle` is never affected.

## Config: the four settings

```json
{"type":"config","id":3,"config":{"target":0,"mass":0,"tension":39321,"friction":32768}}
```

Each of `target`, `mass`, `tension` and `friction` is either a number (the same
everywhere) or a curve: a chain of points.

```json
{"points":[{"x":0,"y":0},{"x":1365,"y":0},{"x":1365,"y":2730},{"x":4096,"y":2730,"in":2000}],"flat_before":true}
```

- **Points:** 1 to 130, with `x` never decreasing. Two points at the same `x`
  make a jump (never three); at that `x` the value is the second's.
- **Segments:** each pair of neighbouring points is a cubic Bézier in y. Its
  handles sit at ⅓ and ⅔ of the way across, so only their values are sent:
  `out` on the first point and `in` on the second. A missing handle is on the
  straight line.
- **Ends:** the chain covers its first point's `x` to its last's. Past an end
  it repeats: at x it is the chain at first + (x − first) mod (last − first).
  With `flat_before` or `flat_after`, it holds that end's value instead. A
  chain whose points all share one `x` holds everywhere.
- **Target values:** where the chain repeats, they are angles in the chain's
  own coordinates and repeat with it: the knob is pulled to the nearest repeat,
  the short way round (exactly half a span away goes the negative way).
  Past a flat end, in a chain with both ends flat, and as a number, the target
  is a global angle.
- **Meaning of each setting:**

  | Setting | 0 | 1 |
  |---|---|---|
  | mass | stock | `tuning.toml`'s `mass`; exponential between: knob and flywheel weigh (1 + that)^mass bare knobs |
  | tension | no spring | `tuning.toml`'s `tension`; 0.5 is half as stiff |
  | friction | a perpetual flywheel | heavy; 0.5 is stock |

A config is baked in microseconds and takes effect at the next 50 µs tick. The
knob acks it with `{"type":"ack","command":"config",...}`, or replies with an
error and keeps its previous curves.

## Commands

Any command may carry `id` (a `u32`); its `ack` or `error` echoes it.

| Command | From | Effect |
|---|---|---|
| `hello` | game | The knob replies with `hello`. |
| `config` | game | New curves (above). |
| `tare`, `global_angle` (default 0), optional `reference` | game | Where the knob was at global angle `reference` now counts as `global_angle`, so turning since the host read `reference` is kept. Without `reference`, where the knob is now. The feel doesn't jump. |
| `reset` | game, cabinet | Stock curves (exactly zero force, the motor-off feel), and no rumble. |
| `brake` | game, cabinet | Stops the knob spinning; an event, not a mode. |
| `rumble`, `pulses` | game | Buzz: up to 16 `{delay_ms, duration_ms, intensity}` one after another, each up to 5000 ms. `intensity` is a 1/65536 fraction of `tuning.toml`'s `rumble`. Replaces any rumble playing. |
| `lease` | cabinet | Keeps non-stock curves alive. Without one for 500 ms, the knob returns to stock. |
| `stats` | dev | Control-loop timing since the last `stats`. |
| `capture_dump` | dev | The raw 4 kHz history: angle, drive and coupling stretch. |

The cabinet's bridge enforces the "from" column, and adds a `player` (1 or
2) to everything between games and knobs.
- **Games:** `hello`, `config`, `tare`, `reset`, `brake` and `rumble`.
- **The cabinet:** sends `reset`, `brake` and `tare` when a game starts, and
  `reset` then `brake` when it leaves.

## Messages

| Message | Content |
|---|---|
| `hello` | `device: "rcade-tknob"`, `id` (the MAC), `max_points`, and `magnet`. |
| `tick` | 100 per second: `angle`, `global_angle`, `curve_angle`, `velocity_q16`, `time_us`. Angles count up clockwise, seen from above. `global_angle` is where the knob is; `curve_angle` is where the curves are read, the flywheel's, so where clicks and walls are felt. It trails the knob by the coupling's stretch: a few degrees while pushing against a spring or speeding up a mass. `velocity_q16` is the flywheel's. |
| `ack` | `command`, its `id` if it had one, and the knob's `time_us` when it took effect. |
| `error` | `message`, and the command's `id` if it had one: a command was rejected, and nothing changed. |
| `status` | `reason`, listed below. |
| `stats` | `ticks`, `worst_tick_us`, `overruns`, `encoder_errors`, and `phases_us`: the slowest sense, listen, think and act phases. |
| `tuning` | The tuning in use, as `_q16` fields. |
| `capture`, `capture_chunk`, `capture_end` | The `capture_dump` reply: the last 2 s at 4 kHz, in columns. `time_us` is the low 32 bits of the knob clock. `angle` is the encoder. `drive_mv` is the drive in mV (−32768 off, −32767 shorted). `stretch` is flywheel minus knob, in 1/65536 turn. |

`magnet` in `hello` is `{pole_pairs, direction, zero}` once found, or `null`
until then.

Status reasons:
- **Normal:** `boot`, `aligned`.
- **Alignment:** `alignment_failed: …`. The knob retries after a beep.
- **Faults**, which turn the gates off and return the knob to stock:
  - `encoder_crc`
  - `encoder_magnetic_field`
  - `driver_fault`
  - `missed_tick`
  - `lease_expired`

Non-JSON lines are boot-ROM text or `panic: …`; hosts skip them.

## Boot

A knob listed under `[magnets]` in `tuning.toml` (by its `id`) starts at once,
silently. Any other knob beeps, waits one second, then holds a field at a few
electrical angles for half a second to find its magnets; keep hands off it.
Until it's aligned, `hello.magnet` is `null` and curves produce no force. Then
`hello.magnet` holds what it found: add that to `tuning.toml` so it starts
silently from the next flash.
