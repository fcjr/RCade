# @rcade/plugin-input-spinners

Read RCade's T-Knob spinners and shape how they feel.

```bash
npm install @rcade/plugin-input-spinners
```

Add `{ "name": "@rcade/input-spinners", "version": "2.0.0" }` to your manifest's dependencies.

## Reading

```javascript
import { P1, P2 } from "@rcade/plugin-input-spinners";

P1.subscribe(({ deltaAngle }) => paddleX += deltaAngle);

const { angle, globalAngle } = P2.read();
```

Degrees throughout. `angle` wraps at 360, `globalAngle` keeps counting. Events also carry `deltaAngle`, `deltaTime` (ms) and `velocity` (°/s).

Angles are where the knob feels it is: detents click and walls stop exactly at them. `rawAngle` is where the hand is, which leads by a few degrees when pushing against a curve.

`tare(90)` makes the current angle 90.

## Feel

Four curves over `globalAngle`:

| | |
|---|---|
| `target` | where the knob is pulled, in degrees |
| `tension` | how hard, 0–1 |
| `mass` | 0 bare, 1 heavy flywheel |
| `friction` | 0 free, 0.5 natural, 1 heavy |

```javascript
import { P1, Curve, Curves } from "@rcade/plugin-input-spinners";

P1.setCurves(Curves.detents(24));
P1.setCurves(Curves.mass(0.5).friction(0));
P1.setCurves(Curves.wall("left").wall("right", { angle: 720 }));
P1.setCurves(Curves.detents(12).tension(Curve.ramp(0, 1)));
```

Each property takes a number or a `Curve`:

- `Curve.uniform(value)`
- `Curve.steps(quantity, { angle })`: as a target, detents
- `Curve.ramp(from, to, { angle, ease })`: `linear`, `in`, `out`, `inOut`
- `Curve.compose(a, b, …)`: end to end
- `Curve.points([{ x, y, in?, out? }, …])`: Bézier chain; two points at one x jump

`angle` defaults to `[0, 360]`. A curve repeats past its span, and a repeating target pulls to the nearest repeat. Walls and uniform values hold forever.

Builders are immutable. `valueAt(x)` and `targetAt(x)` give what the knob computes.

## Rumble

```javascript
P1.rumble("success");
P1.rumble([100, 50, 100]);
P1.rumble(200, { intensity: 1 });
```

Takes [web-haptics](https://haptics.lochie.me)' inputs and presets: `success`, `warning`, `error`, `light`, `medium`, `heavy`, `soft`, `rigid`, `selection`, `nudge`, `buzz`.

## Else

`reset()` returns to stock. `brake()` stops a spin. `connected` says whether the knob is there.

Wire format: `firmware/knob/PROTOCOL.md`.
