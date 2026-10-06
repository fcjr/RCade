// @rcade/plugin-input-spinners
//
// Input and haptics for RCade's T-Knob spinners. Games work in degrees and
// 0..1; the knob works in integers (1/65536 turn), and this module converts
// both ways.

// The plugin channel is loaded on first use, so the curve maths also runs
// outside a browser (tests, tools).

// ─── Units ───────────────────────────────────────────────────────

/** One turn, and 1.0, on the wire. */
export const TURN_UNITS = 65_536;
/** The most points a curve may send, not counting infinite ends. */
export const MAX_POINTS = 128;
/** The most pulses in one rumble. */
export const MAX_PULSES = 16;
/** The longest pause before a pulse, ms: the knob's limit. */
const MAX_DELAY_MS = 5_000;

export function degreesToUnits(degrees: number): number {
    return Math.round(degrees / 360 * TURN_UNITS);
}

export function unitsToDegrees(units: number): number {
    return units * 360 / TURN_UNITS;
}

/** A 0..1 value in 1/65536, clamped: 1 (or more) becomes 65535, the closest
 *  the knob gets, and 1 is already the strongest that doesn't ring. */
export function fractionToUnits(value: number): number {
    return Math.min(TURN_UNITS - 1, Math.max(0, Math.round(value * TURN_UNITS)));
}

// ─── Shared types ────────────────────────────────────────────────

export type CurveInput = Curve | number;
export type Ease = "linear" | "in" | "out" | "inOut";
export type WallSide = "left" | "right";
/** A span of angles (x), in degrees. ±Infinity is allowed, but only for flat curves. */
export type AngleSpan = [start: number, end: number];
export interface Vec2 { x: number; y: number }

/** Input form: a missing handle, or one on its own point, means a straight line. */
export interface CurvePointInput {
    x: number;
    y: number;
    in?: Vec2;
    out?: Vec2;
}

/**
 * The chain the knob receives. x is in degrees of `globalAngle`; y is the
 * property's value: degrees for `target`, 0..1 for the others.
 *
 * Segment i is the cubic Bézier `points[i], points[i].out, points[i+1].in, points[i+1]`.
 * - x never decreases. A jump is two points with the same x.
 * - Handles sit at ⅓ and ⅔ of their segment's x-range, so the knob only
 *   needs their y. `Curve.points` turns any other handles into this form.
 * - Past a finite end the chain repeats, from its first finite x to its
 *   last. Past an infinite end it stays flat.
 * - Segments with an infinite end must be flat.
 * - `in` of the first point and `out` of the last point are ignored.
 *
 * Target values in a repeating stretch are in the chain's own coordinates and
 * repeat with it: the knob is pulled to the nearest repeat, the short way
 * round. Everywhere else (a flat end, or a chain with both ends infinite)
 * they are global angles.
 */
export interface CurvePoint {
    readonly x: number;
    readonly y: number;
    readonly in: Vec2;
    readonly out: Vec2;
}

// ─── Curve maths ─────────────────────────────────────────────────

/** Handle heights for each ease, as fractions of the rise. */
const EASES: Record<Ease, [number, number]> = {
    linear: [1 / 3, 2 / 3],
    in: [0, 1 / 3],
    out: [2 / 3, 1],
    inOut: [0, 1],
};

/** `value` brought into 0..span by whole spans. */
function repeat(value: number, span: number): number {
    return ((value % span) + span) % span;
}

/** `difference` brought into −span/2..span/2: the short way round. Exactly
 *  half a span goes the negative way, as on the knob. */
function shortest(difference: number, span: number): number {
    return repeat(difference + span / 2, span) - span / 2;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

type Cubic = [number, number, number, number];

function bezier([a, b, c, d]: Cubic, t: number): number {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

/** The part of a cubic between parameters t0 and t1, by de Casteljau. */
function part(cubic: Cubic, t0: number, t1: number): Cubic {
    const split = ([a, b, c, d]: Cubic, t: number): [Cubic, Cubic] => {
        const ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t);
        const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), m = lerp(abc, bcd, t);
        return [[a, ab, abc, m], [m, bcd, cd, d]];
    };
    const left = t1 < 1 ? split(cubic, t1)[0] : cubic;
    return t0 > 0 ? split(left, t0 / t1)[1] : left;
}

/** One stretch of a curve: a cubic in y over [x0, x1], handles at the thirds. */
interface Piece { x0: number; x1: number; y: Cubic }

function close(a: number, b: number, scale: number): boolean {
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(scale));
}

/** A segment with handles anywhere inside it, as pieces with handles at the
 *  thirds: exact when they already are, or are on the straight line; else
 *  eight Hermite pieces that follow it closely. */
function thirds(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): Piece[] {
    const width = p3.x - p0.x;
    const scale = Math.max(Math.abs(p0.y), Math.abs(p3.y), width);
    const at = (fraction: number, handle: Vec2) => close(handle.x, p0.x + width * fraction, scale);
    if (at(1 / 3, p1) && at(2 / 3, p2)) return [{ x0: p0.x, x1: p3.x, y: [p0.y, p1.y, p2.y, p3.y] }];
    const onLine = (handle: Vec2) => close((handle.y - p0.y) * width, (p3.y - p0.y) * (handle.x - p0.x), scale * width);
    if (onLine(p1) && onLine(p2)) {
        const rise = p3.y - p0.y;
        return [{ x0: p0.x, x1: p3.x, y: [p0.y, p0.y + rise / 3, p0.y + rise * 2 / 3, p3.y] }];
    }
    // x(t) never decreases while the handles stay inside the segment, so
    // bisection finds the t for each x.
    const xs: Cubic = [p0.x, p1.x, p2.x, p3.x];
    const ys: Cubic = [p0.y, p1.y, p2.y, p3.y];
    const solve = (x: number) => {
        let low = 0, high = 1;
        for (let i = 0; i < 60; i++) {
            const middle = (low + high) / 2;
            if (bezier(xs, middle) < x) low = middle; else high = middle;
        }
        return (low + high) / 2;
    };
    const slope = (x: number) => {
        const h = width * 1e-4;
        const [a, b] = [Math.max(p0.x, x - h), Math.min(p3.x, x + h)];
        return (bezier(ys, solve(b)) - bezier(ys, solve(a))) / (b - a);
    };
    const count = 8;
    const knots = Array.from({ length: count + 1 }, (_, k) => {
        const x = p0.x + width * k / count;
        const t = k === 0 ? 0 : k === count ? 1 : solve(x);
        return { x, y: bezier(ys, t), slope: slope(x) };
    });
    return knots.slice(1).map((knot, k) => {
        const from = knots[k], h = knot.x - from.x;
        return { x0: from.x, x1: knot.x, y: [from.y, from.y + from.slope * h / 3, knot.y - knot.slope * h / 3, knot.y] as Cubic };
    });
}

function flatPoint(x: number, y: number): CurvePoint {
    return { x, y, in: { x, y }, out: { x, y } };
}

/** Points from pieces laid end to end. Touching pieces with the same value
 *  share a point; others meet in a jump. */
function fromPieces(pieces: Piece[]): CurvePoint[] {
    const points: { x: number; y: number; in: Vec2; out: Vec2 }[] = [];
    for (const { x0, x1, y } of pieces) {
        if (!(x1 > x0)) continue;
        const last = points[points.length - 1];
        const start = last && last.x === x0 && last.y === y[0] ? last : (points.push(flatPoint(x0, y[0])), points[points.length - 1]);
        const third = (x1 - x0) / 3;
        start.out = { x: x0 + third, y: y[1] };
        points.push({ x: x1, y: y[3], in: { x: x1 - third, y: y[2] }, out: { x: x1, y: y[3] } });
    }
    return points;
}

/** Check a chain and bring every handle to the thirds. */
function normalise(input: readonly CurvePointInput[]): CurvePoint[] {
    if (input.length === 0) throw new Error("A curve needs at least one point.");
    const finite = (value: unknown, what: string) => {
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Curve ${what} must be finite numbers.`);
    };
    input.forEach((point, index) => {
        finite(point.y, "values");
        if (typeof point.x !== "number" || Number.isNaN(point.x)) throw new Error("Curve x must be a number.");
        if (point.x === -Infinity && index !== 0) throw new Error("Only the first point may be at -Infinity.");
        if (point.x === Infinity && index !== input.length - 1) throw new Error("Only the last point may be at Infinity.");
        if (index > 0 && point.x < input[index - 1].x) throw new Error("Curve x must never decrease.");
        // An infinite point's handles are ignored.
        for (const handle of Number.isFinite(point.x) ? [point.in, point.out] : []) {
            if (handle) { finite(handle.x, "handles"); finite(handle.y, "handles"); }
        }
    });
    const points: { x: number; y: number; in: Vec2; out: Vec2 }[] = [];
    let previous = input[0];
    points.push(flatPoint(previous.x, previous.y));
    for (const point of input.slice(1)) {
        if (point.x === previous.x && point.y === previous.y) {
            // The same point twice, as where composed curves meet: one point.
            previous = { ...previous, out: point.out };
            continue;
        }
        if (!Number.isFinite(previous.x) || !Number.isFinite(point.x)) {
            if (point.y !== previous.y) throw new Error("Segments with an infinite end must be flat.");
            points.push(flatPoint(point.x, point.y));
        } else if (point.x === previous.x) {
            const before = points[points.length - 2];
            if (before && before.x === point.x) throw new Error("A jump is two points with the same x, not three.");
            points.push(flatPoint(point.x, point.y));
        } else {
            // A missing handle, or one on its own point, is the straight
            // line, at its third: the knob's default.
            const straight = (handle: Vec2 | undefined, at: Vec2, fraction: number): Vec2 =>
                handle && !(handle.x === at.x && handle.y === at.y) ? handle
                    : { x: lerp(previous.x, point.x, fraction), y: lerp(previous.y, point.y, fraction) };
            const p1 = straight(previous.out, previous, 1 / 3);
            const p2 = straight(point.in, point, 2 / 3);
            for (const handle of [p1, p2]) {
                if (handle.x < previous.x || handle.x > point.x) throw new Error("Handles must stay inside their segment's x-range.");
            }
            let from = points[points.length - 1];
            for (const { x0, x1, y } of thirds(previous, p1, p2, point)) {
                from.out = { x: x0 + (x1 - x0) / 3, y: y[1] };
                from = { x: x1, y: y[3], in: { x: x1 - (x1 - x0) / 3, y: y[2] }, out: { x: x1, y: y[3] } };
                points.push(from);
            }
        }
        previous = point;
    }
    return points;
}

/** Where a curve repeats and where it's flat, worked out once. */
interface Shape {
    flatBefore: boolean;
    flatAfter: boolean;
    /** The first and last values: what's held past an infinite end. */
    before: number;
    after: number;
    /** The finite part, from its first point to its last. */
    start: number;
    end: number;
    span: number;
    /** No finite points: one value everywhere. */
    uniform: boolean;
    /** Repeats past its finite ends: unless both ends are infinite, or there
     *  is nothing to repeat (all its points at one x). */
    repeats: boolean;
    pieces: Piece[];
}

function shapeOf(points: readonly CurvePoint[]): Shape {
    const flatBefore = points[0].x === -Infinity;
    const flatAfter = points[points.length - 1].x === Infinity;
    const finite = points.filter(point => Number.isFinite(point.x));
    const pieces: Piece[] = [];
    for (let i = 1; i < points.length; i++) {
        const [a, b] = [points[i - 1], points[i]];
        if (Number.isFinite(a.x) && Number.isFinite(b.x) && b.x > a.x) pieces.push({ x0: a.x, x1: b.x, y: [a.y, a.out.y, b.in.y, b.y] });
    }
    const start = finite[0]?.x ?? 0;
    const end = finite[finite.length - 1]?.x ?? 0;
    return {
        flatBefore, flatAfter, pieces, start, end, span: end - start,
        before: (finite[0] ?? points[0]).y, after: (finite[finite.length - 1] ?? points[0]).y,
        uniform: finite.length === 0, repeats: !(flatBefore && flatAfter) && end > start,
    };
}

/** The curve at global angle x: its value, and x in its own coordinates if
 *  that's a repeating stretch. */
function evaluate(shape: Shape, x: number): { value: number; local?: number } {
    if (shape.uniform) return { value: shape.before };
    if (x < shape.start && (shape.flatBefore || !shape.repeats)) return { value: shape.before };
    if (x >= shape.end && (shape.flatAfter || !shape.repeats)) return { value: shape.after };
    const local = shape.repeats ? shape.start + repeat(x - shape.start, shape.span) : x;
    const pieces = shape.pieces;
    let low = 0, high = pieces.length - 1;
    while (low < high) {
        const middle = (low + high + 1) >> 1;
        if (pieces[middle].x0 <= local) low = middle; else high = middle - 1;
    }
    const piece = pieces[low];
    const value = bezier(piece.y, (local - piece.x0) / (piece.x1 - piece.x0));
    return shape.repeats ? { value, local } : { value };
}

function finiteSpan(span: AngleSpan = [0, 360]): AngleSpan {
    if (!Number.isFinite(span[0]) || !Number.isFinite(span[1])) throw new Error("This curve needs a finite angle span.");
    if (!(span[1] > span[0])) throw new Error("A curve's angle span must end after it starts.");
    return span;
}

// ─── Curve ───────────────────────────────────────────────────────

/** A value over the knob's global angle. Every curve sets its own angle
 *  span, and x is always an absolute angle. Curves never change. */
export class Curve {
    /** The underlying chain, the same data the knob receives (in degrees). */
    readonly points: readonly CurvePoint[];
    private readonly shape: Shape;

    private constructor(points: CurvePoint[]) {
        this.points = Object.freeze(points.map(point => Object.freeze({ ...point, in: Object.freeze({ ...point.in }), out: Object.freeze({ ...point.out }) })));
        this.shape = shapeOf(this.points);
    }

    /** One value. Default angle: [-Infinity, Infinity]. */
    static uniform(value: number, opts: { angle?: AngleSpan } = {}): Curve {
        const [start, end] = opts.angle ?? [-Infinity, Infinity];
        if (!(end > start)) throw new Error("A curve's angle span must end after it starts.");
        return new Curve(normalise([{ x: start, y: value }, { x: end, y: value }]));
    }

    /**
     * `quantity` evenly spaced steps across the span: the value at x is the
     * nearest step's angle, so as a target it makes detents. Default angle:
     * [0, 360]. Throws if the angle span is infinite.
     */
    static steps(quantity: number, opts: { angle?: AngleSpan } = {}): Curve {
        const [start, end] = finiteSpan(opts.angle);
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error("steps needs a whole number of steps, at least 1.");
        const width = (end - start) / quantity;
        const points: CurvePointInput[] = [{ x: start, y: start }];
        for (let step = 0; step < quantity; step++) {
            const boundary = start + (step + 0.5) * width;
            points.push({ x: boundary, y: start + step * width }, { x: boundary, y: start + (step + 1) * width });
        }
        points.push({ x: end, y: end });
        return new Curve(normalise(points));
    }

    /** Goes from `from` to `to` across its angle span. Default angle: [0, 360].
     *  Throws if the angle span is infinite. */
    static ramp(from: number, to: number, opts: { angle?: AngleSpan; ease?: Ease } = {}): Curve {
        const [start, end] = finiteSpan(opts.angle);
        const [first, second] = EASES[opts.ease ?? "linear"];
        const width = end - start, rise = to - from;
        return new Curve(normalise([
            { x: start, y: from, out: { x: start + width / 3, y: from + rise * first } },
            { x: end, y: to, in: { x: end - width / 3, y: from + rise * second } },
        ]));
    }

    /**
     * Joins curves end to end, in order. Each curve keeps its own angle span.
     * Spans must touch exactly: a gap or overlap throws.
     */
    static compose(...curves: Curve[]): Curve {
        if (curves.length === 0) throw new Error("compose needs at least one curve.");
        curves.forEach((curve, index) => {
            if (index > 0 && curves[index - 1].span[1] !== curve.span[0]) {
                throw new Error(`compose: curve ${index} starts at ${curve.span[0]}°, not where the one before ends (${curves[index - 1].span[1]}°).`);
            }
        });
        return new Curve(normalise(curves.flatMap(curve => curve.points)));
    }

    /** Escape hatch: build a curve directly from a point chain. */
    static points(points: readonly CurvePointInput[]): Curve {
        return new Curve(normalise(points));
    }

    /** From the first point's x to the last's. */
    get span(): AngleSpan {
        return [this.points[0].x, this.points[this.points.length - 1].x];
    }

    /** The curve's value at a global angle, as the knob computes it. */
    valueAt(x: number): number {
        return evaluate(this.shape, x).value;
    }

    /** As a target: the global angle the knob at `x` is pulled toward. */
    targetAt(x: number): number {
        const { value, local } = evaluate(this.shape, x);
        return local === undefined ? value : x + shortest(value - local, this.shape.span);
    }

    /** The same values from `from` to `to` (both finite) as pieces, repeats
     *  unrolled. Target values become the global angles they pull to. */
    private slice(from: number, to: number, target: boolean): Piece[] {
        const shape = this.shape;
        const pieces: Piece[] = [];
        const flat = (x0: number, x1: number, value: number) => {
            if (x1 > x0) pieces.push({ x0, x1, y: [value, value, value, value] });
        };
        if (!shape.repeats) {
            flat(from, Math.min(to, shape.start), shape.before);
        } else if (shape.flatBefore) {
            flat(from, Math.min(to, shape.start), shape.before);
        }
        const low = shape.repeats && !shape.flatBefore ? from : Math.max(from, shape.start);
        const high = shape.repeats && !shape.flatAfter ? to : Math.min(to, shape.end);
        if (low < high && !shape.uniform) {
            const [first, last] = shape.repeats
                ? [Math.floor((low - shape.start) / shape.span), Math.ceil((high - shape.start) / shape.span)]
                : [0, 1];
            if (last - first > 1_000) throw new Error("That would unroll too many repeats of the curve.");
            for (let copy = first; copy < last; copy++) {
                const shift = shape.repeats ? copy * shape.span : 0;
                for (const piece of shape.pieces) {
                    const [x0, x1] = [piece.x0 + shift, piece.x1 + shift];
                    const [a, b] = [Math.max(x0, low), Math.min(x1, high)];
                    if (!(b > a)) continue;
                    let y = piece.y;
                    if (target && shape.repeats) {
                        // Pulled the short way round, from the piece's start.
                        const offset = shift + shortest(y[0] - piece.x0, shape.span) - (y[0] - piece.x0);
                        y = y.map(value => value + offset) as Cubic;
                    }
                    pieces.push({ x0: a, x1: b, y: part(y, (a - x0) / (x1 - x0), (b - x0) / (x1 - x0)) });
                }
            }
        }
        if (!shape.repeats || shape.flatAfter) flat(Math.max(from, shape.end), to, shape.after);
        return pieces;
    }

    /**
     * @internal The curve as `past` (from `pastWall`) beyond `angle` on
     * `side`, and as it was on the other. A flat end already on that side is
     * replaced.
     */
    walled(side: WallSide, angle: number, past: CurvePoint[], target: boolean): Curve {
        if (!Number.isFinite(angle)) throw new Error("A wall needs a finite angle.");
        const shape = this.shape;
        // What carries on past the wall: up to where the curve holds its end
        // value (a flat end, or both ends of one that doesn't repeat), or one
        // span of it repeating if it does.
        const holdsAfter = shape.flatAfter || !shape.repeats;
        const holdsBefore = shape.flatBefore || !shape.repeats;
        let rest: CurvePoint[];
        if (side === "left") {
            if (shape.uniform || (holdsAfter && angle >= shape.end)) rest = [flatPoint(angle, shape.after), flatPoint(Infinity, shape.after)];
            else if (holdsAfter) rest = [...fromPieces(this.slice(angle, shape.end, target)), flatPoint(shape.end, shape.after), flatPoint(Infinity, shape.after)];
            else rest = fromPieces(this.slice(angle, angle + shape.span, target));
            if (rest[0].x !== angle) rest.unshift(flatPoint(angle, rest[0].y));
            return new Curve(normalise([...past, ...rest]));
        }
        if (shape.uniform || (holdsBefore && angle <= shape.start)) rest = [flatPoint(-Infinity, shape.before), flatPoint(angle, shape.before)];
        else if (holdsBefore) rest = [flatPoint(-Infinity, shape.before), flatPoint(shape.start, shape.before), ...fromPieces(this.slice(shape.start, angle, target))];
        else rest = fromPieces(this.slice(angle - shape.span, angle, target));
        const last = rest[rest.length - 1];
        if (last.x !== angle) rest.push(flatPoint(angle, last.y));
        return new Curve(normalise([...rest, ...past]));
    }
}

/** Beyond a wall: `atWall`, straight to `far` over `fade` degrees, then held. */
function pastWall(side: WallSide, angle: number, atWall: number, far = atWall, fade = 0): CurvePoint[] {
    const away = side === "left" ? -1 : 1;
    const points = [flatPoint(angle, atWall)];
    if (fade > 0) points.push(flatPoint(angle + away * fade, far));
    points.push(flatPoint(away * Infinity, far));
    return side === "left" ? points.reverse() : points;
}

/** Past a wall, friction fades to 0 over this many degrees. */
const WALL_FRICTION_FADE = 180;

function curve(input: CurveInput): Curve {
    return typeof input === "number" ? Curve.uniform(input) : input;
}

// ─── Curves (per-property builder) ───────────────────────────────

/** Defaults: angle 0, tension 1, friction 1 (fading to 0 over 180°). */
export interface WallOptions {
    angle?: number;
    tension?: number;
    friction?: number;
}

/** The four property names, in the order the knob lists them. */
export const PROPERTIES = ["target", "mass", "tension", "friction"] as const;
export type Property = typeof PROPERTIES[number];

/** All four properties. Every method returns a new builder; existing
 *  builders never change. */
export class Curves {
    private readonly curves: Readonly<Record<Property, Curve>>;

    private constructor(curves: Readonly<Record<Property, Curve>>) {
        this.curves = curves;
    }

    /** The stock feel: exactly like the motor is off. */
    static create(): Curves {
        return new Curves({ target: Curve.uniform(0), mass: Curve.uniform(0), tension: Curve.uniform(0), friction: Curve.uniform(0.5) });
    }

    static target(c: CurveInput): Curves { return Curves.create().target(c); }
    static tension(c: CurveInput): Curves { return Curves.create().tension(c); }
    static mass(c: CurveInput): Curves { return Curves.create().mass(c); }
    static friction(c: CurveInput): Curves { return Curves.create().friction(c); }

    /** Preset: target = steps(quantity), tension = uniform(tension, default 0.5). */
    static detents(quantity: number, opts?: { tension?: number }): Curves { return Curves.create().detents(quantity, opts); }

    /**
     * Preset: a hard wall at `angle` (default 0).
     * "left" covers [-Infinity, angle], "right" covers [angle, Infinity].
     * Past the wall, target is held at `angle` and tension is set to `tension`
     * (default 1). Friction is `friction` (default 1) at the wall, so it
     * doesn't bounce, fading to 0 over 180° beyond it.
     * The rest of the curves stays as it was.
     */
    static wall(side: WallSide, opts?: WallOptions): Curves { return Curves.create().wall(side, opts); }
    /** The same as `wall`. */
    static stop(side: WallSide, opts?: WallOptions): Curves { return Curves.create().wall(side, opts); }

    /**
     * One property's curve:
     * - `target`: where the knob wants to be, in degrees;
     * - `tension`: how hard it springs toward `target`, 0 (no spring) to 1;
     * - `mass`: added flywheel mass, 0 (the bare knob) to 1 (heavy);
     * - `friction`: 0 spins freely, 0.5 is the knob's own feel, 1 is heavy.
     */
    get(property: Property): Curve { return this.curves[property]; }

    /** Where the knob wants to be, in degrees. */
    target(c: CurveInput): Curves { return this.with("target", curve(c)); }
    /** How hard it springs toward the target: 0 is no spring, 1 is stiff. */
    tension(c: CurveInput): Curves { return this.with("tension", curve(c)); }
    /** Added flywheel mass: 0 is the bare knob, 1 is heavy. */
    mass(c: CurveInput): Curves { return this.with("mass", curve(c)); }
    /** 0 spins freely, 0.5 is the knob's own feel, 1 is heavy. */
    friction(c: CurveInput): Curves { return this.with("friction", curve(c)); }

    detents(quantity: number, opts: { tension?: number } = {}): Curves {
        return this.target(Curve.steps(quantity)).tension(opts.tension ?? 0.5);
    }

    wall(side: WallSide, opts: WallOptions = {}): Curves {
        const angle = opts.angle ?? 0;
        return this
            .with("target", this.curves.target.walled(side, angle, pastWall(side, angle, angle), true))
            .with("tension", this.curves.tension.walled(side, angle, pastWall(side, angle, opts.tension ?? 1), false))
            .with("friction", this.curves.friction.walled(side, angle, pastWall(side, angle, opts.friction ?? 1, 0, WALL_FRICTION_FADE), false));
    }

    /** The same as `wall`. */
    stop(side: WallSide, opts?: WallOptions): Curves { return this.wall(side, opts); }

    private with(property: Property, value: Curve): Curves {
        return new Curves({ ...this.curves, [property]: value });
    }
}

// ─── Rumble ──────────────────────────────────────────────────────
// A buzz on top of the curves. The same inputs and presets as web-haptics'
// `trigger` (haptics.lochie.me; its src/lib/web-haptics/{types,patterns}.ts),
// renamed: here "haptics" means the curves.

export interface Vibration {
    /** How long it buzzes, in ms. At most 1000, like web-haptics. */
    duration: number;
    /** 0..1. Default: the rumble's `intensity` option. */
    intensity?: number;
    /** A pause before it, in ms. */
    delay?: number;
}

/** `navigator.vibrate`-style on/off durations, or a list of vibrations. */
export type RumblePattern = number[] | Vibration[];

export interface RumblePreset {
    pattern: Vibration[];
}

/** A duration in ms, a preset's name, a pattern, or a preset. */
export type RumbleInput = number | string | RumblePattern | RumblePreset;

export interface RumbleOptions {
    /** The intensity of vibrations that don't set their own, 0..1. Default 0.5. */
    intensity?: number;
}

/** web-haptics' presets, as they are there. */
export const rumblePresets = {
    // --- Notification (UINotificationFeedbackGenerator) ---
    success: { pattern: [{ duration: 30, intensity: 0.5 }, { delay: 60, duration: 40, intensity: 1 }] },
    warning: { pattern: [{ duration: 40, intensity: 0.8 }, { delay: 100, duration: 40, intensity: 0.6 }] },
    error: { pattern: [{ duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.7 }, { delay: 40, duration: 40, intensity: 0.9 }, { delay: 40, duration: 50, intensity: 0.6 }] },
    // --- Impact (UIImpactFeedbackGenerator) ---
    light: { pattern: [{ duration: 15, intensity: 0.4 }] },
    medium: { pattern: [{ duration: 25, intensity: 0.7 }] },
    heavy: { pattern: [{ duration: 35, intensity: 1 }] },
    soft: { pattern: [{ duration: 40, intensity: 0.5 }] },
    rigid: { pattern: [{ duration: 10, intensity: 1 }] },
    // --- Selection (UISelectionFeedbackGenerator) ---
    selection: { pattern: [{ duration: 8, intensity: 0.3 }] },
    // --- Custom ---
    nudge: { pattern: [{ duration: 80, intensity: 0.8 }, { delay: 80, duration: 50, intensity: 0.3 }] },
    buzz: { pattern: [{ duration: 1000, intensity: 1 }] },
} as const satisfies Record<string, RumblePreset>;

/** What `rumble()` plays with no input, as web-haptics' `trigger()` does. */
const DEFAULT_RUMBLE: RumbleInput = [{ duration: 25, intensity: 0.7 }];
/** web-haptics' longest vibration. */
const MAX_DURATION_MS = 1_000;

/** Any input as plain vibrations, or null (with a warning) for an unknown preset. */
export function vibrations(input: RumbleInput): Vibration[] | null {
    if (typeof input === "number") return [{ duration: input }];
    if (typeof input === "string") {
        const preset = rumblePresets[input as keyof typeof rumblePresets];
        if (!preset) {
            console.warn(`[input-spinners] Unknown rumble preset: "${input}"`);
            return null;
        }
        return preset.pattern.map(vibration => ({ ...vibration }));
    }
    if (Array.isArray(input)) {
        if (input.length === 0) return [];
        if (typeof input[0] === "number") {
            // On, off, on, …: each "off" is the next vibration's delay.
            const durations = input as number[];
            const out: Vibration[] = [];
            for (let i = 0; i < durations.length; i += 2) {
                const delay = i > 0 ? durations[i - 1] : 0;
                out.push({ ...(delay > 0 && { delay }), duration: durations[i] });
            }
            return out;
        }
        return (input as Vibration[]).map(vibration => ({ ...vibration }));
    }
    return input.pattern.map(vibration => ({ ...vibration }));
}

// ─── The wire: exactly what the knob sends and receives ──────────

export interface WirePoint { x: number; y: number; in?: number; out?: number }
export interface WireCurve { points: WirePoint[]; flat_before?: true; flat_after?: true }
export type WireSetting = number | WireCurve;
export interface WireConfig { target: WireSetting; mass: WireSetting; tension: WireSetting; friction: WireSetting }
export interface WirePulse { delay_ms: number; duration_ms: number; intensity: number }

/** How the knob found its magnet at boot; null until then (it can't push yet). */
export interface Magnet { pole_pairs: number; direction: 1 | -1; zero: number }

export type Player = 1 | 2;

/** `Omit` for each member of a union. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** What a game sends the cabinet for one knob. `id`s come back on the
 *  command's ack or error. */
export type WireCommand = { player: Player; id?: number } & (
    | { type: "hello" }
    | { type: "config"; config: WireConfig }
    /** Where the knob was at `reference` now counts as `global_angle`; any
     *  turning since `reference` was read is kept. Without a reference:
     *  where the knob is now. */
    | { type: "tare"; reference?: number; global_angle: number }
    /** Back to the stock feel; stops any rumble. */
    | { type: "reset" }
    /** Stop the knob spinning: an event, the curves stay. */
    | { type: "brake" }
    | { type: "rumble"; pulses: WirePulse[] }
);

/** What the cabinet sends a game about one knob. */
export type WireMessage =
    /** `device` is "rcade-tknob", or for now the cabinet's old spinner. */
    | { type: "hello"; player: Player; device: string; id: string; magnet: Magnet | null; max_points: number }
    /** In 1/65536 turns since boot or a tare: `global_angle` is where the
     *  knob is, `curve_angle` where the curves are read (the knob's
     *  flywheel). `velocity_q16` is the curve angle's, turns/s. `angle` is
     *  the raw encoder. */
    | { type: "tick"; player: Player; angle: number; global_angle: number; curve_angle: number; velocity_q16: number; time_us: number }
    | { type: "status"; player: Player; reason: string }
    | { type: "ack"; player: Player; command: string; id?: number; time_us: number }
    | { type: "error"; player?: Player; message: string; id?: number }
    | { type: "connection"; player: Player; connected: boolean; message: string };

function pointsToWire(points: readonly CurvePoint[], target: boolean): WireSetting {
    const value = target ? degreesToUnits : fractionToUnits;
    const flatBefore = points[0].x === -Infinity;
    const flatAfter = points[points.length - 1].x === Infinity;
    const finite = points.filter(point => Number.isFinite(point.x));
    if (finite.length === 0) return value(points[0].y);
    if (finite.length > MAX_POINTS) throw new Error(`A curve can send at most ${MAX_POINTS} points; this one has ${finite.length}.`);
    const wire: WirePoint[] = finite.map(point => ({ x: degreesToUnits(point.x), y: value(point.y) }));
    finite.forEach((point, index) => {
        const next = finite[index + 1];
        if (!next || next.x === point.x) return;
        // Handles on the straight line are left out: the knob's default.
        const [y0, y3] = [wire[index].y, wire[index + 1].y];
        const out = value(point.out.y), into = value(next.in.y);
        if (out !== Math.round(y0 + (y3 - y0) / 3) || into !== Math.round(y0 + (y3 - y0) * 2 / 3)) {
            wire[index].out = out;
            wire[index + 1].in = into;
        }
    });
    wire.forEach((point, index) => {
        if (index >= 2 && wire[index - 2].x === point.x) throw new Error("Curve points are too close together: keep jumps at least 1/65536 turn apart.");
    });
    return { points: wire, ...(flatBefore ? { flat_before: true } : {}), ...(flatAfter ? { flat_after: true } : {}) } as WireCurve;
}

export function curveToWire(curve: Curve, target: boolean): WireSetting {
    return pointsToWire(curve.points, target);
}

export function curvesToWire(curves: Curves): WireConfig {
    return {
        target: curveToWire(curves.get("target"), true),
        mass: curveToWire(curves.get("mass"), false),
        tension: curveToWire(curves.get("tension"), false),
        friction: curveToWire(curves.get("friction"), false),
    };
}

/** A rumble as the knob's pulses, or null (with a warning) if it can't play:
 *  an unknown preset, a negative or non-finite time, or too many vibrations. */
export function pulsesToWire(input: RumbleInput = DEFAULT_RUMBLE, options: RumbleOptions = {}): WirePulse[] | null {
    const list = vibrations(input);
    if (!list) return null;
    const valid = (value: number | undefined) => value === undefined || (Number.isFinite(value) && value >= 0);
    if (!list.every(item => valid(item.duration) && valid(item.delay))) {
        console.warn("[input-spinners] Invalid vibration values. Durations and delays must be finite non-negative numbers.");
        return null;
    }
    if (list.length > MAX_PULSES) {
        console.warn(`[input-spinners] A rumble has at most ${MAX_PULSES} vibrations; this one has ${list.length}.`);
        return null;
    }
    const unit = (value: number) => Math.max(0, Math.min(1, value));
    const fallback = unit(options.intensity ?? 0.5);
    return list.map(item => ({
        delay_ms: Math.min(MAX_DELAY_MS, Math.round(item.delay ?? 0)),
        duration_ms: Math.min(MAX_DURATION_MS, Math.round(item.duration)),
        intensity: fractionToUnits(unit(item.intensity ?? fallback)),
    }));
}

// ─── Spinners ────────────────────────────────────────────────────

/** Angles are where the curves are read: detents click at them. */
export interface SpinnerState {
    /** Wrapped angle in degrees, [0, 360) */
    angle: number;
    /** Total angle in degrees, keeps counting across turns */
    globalAngle: number;
    /** Where the hand is: leads `globalAngle` while pushing against a curve. */
    rawAngle: number;
}

export interface SpinnerEvent extends SpinnerState {
    /** Signed change in degrees since the last event */
    deltaAngle: number;
    /** Milliseconds since the last event, on the knob's clock */
    deltaTime: number;
    /** Degrees per second */
    velocity: number;
}

/** How long a command may wait for the knob before it fails. */
const COMMAND_TIMEOUT_MS = 2_000;

interface Pending {
    type: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

/** The plugin channel, shared by both players: acquired on first use. */
class Link {
    private port?: MessagePort;
    private acquiring?: Promise<void>;
    private nextId = 1;
    private readonly receivers = new Map<Player, (message: WireMessage) => void>();

    receiver(player: Player, receive: (message: WireMessage) => void): void {
        this.receivers.set(player, receive);
    }

    /** Acquire the channel if nobody has yet. Outside the cabinet this never
     *  finishes, and the spinners stay still. */
    start(): void {
        this.acquiring ??= import("@rcade/sdk").then(({ PluginChannel }) => PluginChannel.acquire("@rcade/input-spinners", "^2.0.0")).then(channel => {
            this.port = channel.getPort();
            this.port.addEventListener("message", (event: MessageEvent<WireMessage>) => {
                const message = event.data;
                if (message.player) this.receivers.get(message.player)?.(message);
                else for (const receive of this.receivers.values()) receive(message);
            });
            this.port.start();
            for (const player of [1, 2] as const) this.post({ player, type: "hello" });
        }, error => console.error("[input-spinners]", error));
    }

    get open(): boolean { return this.port !== undefined; }

    id(): number { return this.nextId++; }

    post(command: WireCommand): void {
        this.start();
        this.port?.postMessage(command);
    }
}

const link = new Link();

/** One T-Knob. */
export class Spinner {
    /** The knob is plugged in and has said hello. */
    connected = false;
    /** The knob's ID (its MAC), once connected. */
    deviceId = "";
    private globalUnits = 0;
    private rawUnits = 0;
    private velocityUnits = 0;
    /** The knob's clock at the last event, µs. */
    private eventUs?: number;
    /** The next tick only says where the knob is now: it didn't turn there. */
    private rebase = true;
    /** Unacked tares by id, and how far each shifts the angles. Ticks sent
     *  before them get shifted; `undefined` (no reference) skips them. */
    private readonly tares = new Map<number, number | undefined>();
    private readonly listeners = new Set<(event: SpinnerEvent) => void>();
    private readonly pending = new Map<number, Pending>();
    /** The game's latest curves: sent again whenever the knob (re)connects. */
    private curves?: WireConfig;

    readonly player: Player;

    constructor(player: Player) {
        this.player = player;
        link.receiver(player, message => this.receive(message));
    }

    read(): SpinnerState {
        link.start();
        return this.state();
    }

    /** Called with every movement. Returns an unsubscribe function. */
    subscribe(cb: (e: SpinnerEvent) => void): () => void {
        link.start();
        this.listeners.add(cb);
        return () => { this.listeners.delete(cb); };
    }

    /** Buzz the knob, on top of its curves. The same inputs and presets as
     *  web-haptics' `trigger` (haptics.lochie.me). A new rumble replaces one
     *  that's playing. */
    rumble(input?: RumbleInput, options?: RumbleOptions): void {
        const pulses = pulsesToWire(input, options);
        if (pulses && this.connected) link.post({ player: this.player, type: "rumble", pulses });
    }

    /**
     * Sets `angle` and `globalAngle` to `angle` (default 0). Turning while
     * the message is in transit isn't lost. Resolves when the knob confirms.
     */
    tare(angle = 0): Promise<void> {
        const units = degreesToUnits(angle);
        const reference = this.rebase ? undefined : this.rawUnits;
        // The knob tares the hand's angle; the curve angle follows.
        const raw = reference === undefined ? units : units + this.rawUnits - this.globalUnits;
        return this.command({ type: "tare", reference, global_angle: raw }, id => {
            this.tares.set(id, reference === undefined ? undefined : raw - reference);
            this.globalUnits = units;
            this.rawUnits = raw;
        });
    }

    /** Replace all four curves. Resolves once the knob uses them. The curves
     *  are kept: if the knob reconnects, they're sent again. */
    setCurves(curves: Curves): Promise<void> {
        this.curves = curvesToWire(curves);
        // Open the channel if nothing has yet, or the knob never connects.
        link.start();
        if (!this.connected) {
            // Sent when the knob connects; resolved by that config's ack.
            return new Promise((resolve, reject) => this.wait(link.id(), "config", resolve, reject, false));
        }
        return this.command({ type: "config", config: this.curves });
    }

    /** Back to the stock feel, as if the motor were off. */
    reset(): Promise<void> {
        this.curves = undefined;
        return this.command({ type: "reset" });
    }

    /** Stop the knob spinning. The curves stay. */
    brake(): Promise<void> {
        return this.command({ type: "brake" });
    }

    private state(): SpinnerState {
        const globalAngle = unitsToDegrees(this.globalUnits);
        return { angle: repeat(globalAngle, 360), globalAngle, rawAngle: unitsToDegrees(this.rawUnits) };
    }

    /** `sent` runs as the command goes out, before anything else arrives. */
    private command(command: Without<WireCommand, "player" | "id">, sent?: (id: number) => void): Promise<void> {
        // The first call opens the channel, so a later one finds the knob.
        link.start();
        if (!this.connected) return Promise.reject(new Error(`Spinner P${this.player} is not connected.`));
        const id = link.id();
        return new Promise((resolve, reject) => {
            this.wait(id, command.type, resolve, reject, true);
            link.post({ ...command, player: this.player, id } as WireCommand);
            sent?.(id);
        });
    }

    private wait(id: number, type: string, resolve: () => void, reject: (error: Error) => void, timed: boolean): void {
        const timer = setTimeout(() => {
            if (!timed) return;
            this.pending.delete(id);
            this.tares.delete(id);
            reject(new Error(`The knob didn't answer ${type} in time.`));
        }, COMMAND_TIMEOUT_MS);
        this.pending.set(id, { type, resolve, reject, timer });
    }

    private settle(id: number | undefined, command: string, error?: string): void {
        if (id === undefined) return;
        for (const [key, pending] of this.pending) {
            // Configs apply in order, and the cabinet drops a queued config
            // when a newer one replaces it: a config's ack answers every
            // config sent before it.
            const answered = key === id || (!error && command === "config" && pending.type === "config" && key < id);
            if (!answered) continue;
            clearTimeout(pending.timer);
            this.pending.delete(key);
            // A tare that failed didn't move anything.
            const shift = this.tares.get(key);
            if (error && shift !== undefined) {
                this.globalUnits -= shift;
                this.rawUnits -= shift;
            }
            this.tares.delete(key);
            if (error) pending.reject(new Error(error));
            else pending.resolve();
        }
    }

    private receive(message: WireMessage): void {
        switch (message.type) {
            case "hello": {
                this.connected = true;
                this.deviceId = message.id;
                // A new connection or a restarted knob: its angle jumps
                // without turning, and it holds stock curves.
                this.rebase = true;
                this.tares.clear();
                if (this.curves) link.post({ player: this.player, id: link.id(), type: "config", config: this.curves });
                return;
            }
            case "connection":
                this.connected = message.connected && this.connected;
                if (!message.connected) this.deviceId = "";
                return;
            case "tick": {
                let shift = 0;
                for (const tare of this.tares.values()) {
                    if (tare === undefined) return;
                    shift += tare;
                }
                const globalUnits = message.curve_angle + shift;
                const rawUnits = message.global_angle + shift;
                const moved = (globalUnits !== this.globalUnits || rawUnits !== this.rawUnits) && !this.rebase;
                const deltaAngle = unitsToDegrees(globalUnits - this.globalUnits);
                this.globalUnits = globalUnits;
                this.rawUnits = rawUnits;
                this.velocityUnits = message.velocity_q16;
                if (this.rebase) this.eventUs = undefined;
                this.rebase = false;
                if (moved) {
                    const deltaTime = this.eventUs === undefined ? 0 : (message.time_us - this.eventUs) / 1000;
                    this.eventUs = message.time_us;
                    const event = { ...this.state(), deltaAngle, deltaTime, velocity: unitsToDegrees(this.velocityUnits) };
                    for (const listener of this.listeners) listener(event);
                }
                return;
            }
            case "ack": return this.settle(message.id, message.command);
            case "error": return this.settle(message.id, "", message.message);
        }
    }
}

export const P1 = new Spinner(1);
export const P2 = new Spinner(2);
