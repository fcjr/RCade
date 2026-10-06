//! Curves: a value over the knob's global angle, and `Curves`, the four the
//! knob uses. The maths is the knob's own (see the firmware's `core`), so
//! `value_at` and `target_at` give exactly what it computes.

// `!(b > a)` is deliberate: like the TypeScript, NaN counts as "not after".
#![allow(clippy::neg_cmp_op_on_partial_ord)]

use std::ops::Range;
use std::sync::Arc;

use crate::Error;

// ─── Shared types ────────────────────────────────────────────────

/// A point or handle: x in degrees, y the curve's value.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec2 {
    pub x: f64,
    pub y: f64,
}

impl Vec2 {
    pub const fn new(x: f64, y: f64) -> Self {
        Vec2 { x, y }
    }
}

impl From<(f64, f64)> for Vec2 {
    fn from((x, y): (f64, f64)) -> Self {
        Vec2 { x, y }
    }
}

/// How a ramp gets from one value to the other.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub enum Ease {
    #[default]
    Linear,
    In,
    Out,
    InOut,
}

impl Ease {
    /// Handle heights, as fractions of the rise.
    fn handles(self) -> (f64, f64) {
        match self {
            Ease::Linear => (1.0 / 3.0, 2.0 / 3.0),
            Ease::In => (0.0, 1.0 / 3.0),
            Ease::Out => (2.0 / 3.0, 1.0),
            Ease::InOut => (0.0, 1.0),
        }
    }
}

/// Which side of a wall is blocked: `Left` covers [-∞, angle], `Right`
/// covers [angle, ∞].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum WallSide {
    Left,
    Right,
}

/// A span of angles (x), in degrees. ±∞ is allowed, but only for flat curves.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct AngleSpan {
    pub start: f64,
    pub end: f64,
}

impl AngleSpan {
    pub const fn new(start: f64, end: f64) -> Self {
        AngleSpan { start, end }
    }

    /// [0, 360]: the default for `steps` and `ramp`.
    pub const TURN: AngleSpan = AngleSpan::new(0.0, 360.0);
    /// [-∞, ∞]: the default for `uniform`.
    pub const ALL: AngleSpan = AngleSpan::new(f64::NEG_INFINITY, f64::INFINITY);

    fn finite(self) -> Result<AngleSpan, Error> {
        if !self.start.is_finite() || !self.end.is_finite() {
            return Err(Error::InfiniteSpan);
        }
        if !(self.end > self.start) {
            return Err(Error::EmptySpan);
        }
        Ok(self)
    }
}

impl From<(f64, f64)> for AngleSpan {
    fn from((start, end): (f64, f64)) -> Self {
        AngleSpan { start, end }
    }
}

impl From<[f64; 2]> for AngleSpan {
    fn from([start, end]: [f64; 2]) -> Self {
        AngleSpan { start, end }
    }
}

impl From<Range<f64>> for AngleSpan {
    fn from(range: Range<f64>) -> Self {
        AngleSpan { start: range.start, end: range.end }
    }
}

/// Input form of a point: a missing handle, or one on its own point, means a
/// straight line.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CurvePointInput {
    pub x: f64,
    pub y: f64,
    pub handle_in: Option<Vec2>,
    pub handle_out: Option<Vec2>,
}

impl CurvePointInput {
    pub const fn new(x: f64, y: f64) -> Self {
        CurvePointInput { x, y, handle_in: None, handle_out: None }
    }

    /// With the handle that shapes the segment arriving at this point.
    pub const fn with_in(self, x: f64, y: f64) -> Self {
        CurvePointInput { handle_in: Some(Vec2::new(x, y)), ..self }
    }

    /// With the handle that shapes the segment leaving this point.
    pub const fn with_out(self, x: f64, y: f64) -> Self {
        CurvePointInput { handle_out: Some(Vec2::new(x, y)), ..self }
    }
}

impl From<(f64, f64)> for CurvePointInput {
    fn from((x, y): (f64, f64)) -> Self {
        CurvePointInput::new(x, y)
    }
}

impl From<CurvePoint> for CurvePointInput {
    fn from(point: CurvePoint) -> Self {
        CurvePointInput {
            x: point.x,
            y: point.y,
            handle_in: Some(point.handle_in),
            handle_out: Some(point.handle_out),
        }
    }
}

/// The chain the knob receives. x is in degrees of global angle; y is the
/// property's value: degrees for `target`, 0..1 for the others.
///
/// Segment i is the cubic Bézier `points[i], points[i].handle_out,
/// points[i+1].handle_in, points[i+1]`.
/// - x never decreases. A jump is two points with the same x.
/// - Handles sit at ⅓ and ⅔ of their segment's x-range, so the knob only
///   needs their y. [`Curve::points`] gives every chain in this form.
/// - Past a finite end the chain repeats, from its first finite x to its
///   last. Past an infinite end it stays flat.
/// - Segments with an infinite end must be flat.
/// - `handle_in` of the first point and `handle_out` of the last are ignored.
///
/// Target values in a repeating stretch are in the chain's own coordinates and
/// repeat with it: the knob is pulled to the nearest repeat, the short way
/// round. Everywhere else (a flat end, or a chain with both ends infinite)
/// they are global angles.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CurvePoint {
    pub x: f64,
    pub y: f64,
    pub handle_in: Vec2,
    pub handle_out: Vec2,
}

// ─── Curve maths ─────────────────────────────────────────────────

/// `value` brought into 0..span by whole spans.
fn repeat(value: f64, span: f64) -> f64 {
    ((value % span) + span) % span
}

/// `difference` brought into −span/2..span/2: the short way round. Exactly
/// half a span goes the negative way, as on the knob.
fn shortest(difference: f64, span: f64) -> f64 {
    repeat(difference + span / 2.0, span) - span / 2.0
}

pub(crate) fn repeat_degrees(value: f64) -> f64 {
    repeat(value, 360.0)
}

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

type Cubic = [f64; 4];

fn bezier([a, b, c, d]: Cubic, t: f64) -> f64 {
    let u = 1.0 - t;
    u * u * u * a + 3.0 * u * u * t * b + 3.0 * u * t * t * c + t * t * t * d
}

/// The part of a cubic between parameters t0 and t1, by de Casteljau.
fn part(cubic: Cubic, t0: f64, t1: f64) -> Cubic {
    fn split([a, b, c, d]: Cubic, t: f64) -> (Cubic, Cubic) {
        let (ab, bc, cd) = (lerp(a, b, t), lerp(b, c, t), lerp(c, d, t));
        let (abc, bcd) = (lerp(ab, bc, t), lerp(bc, cd, t));
        let m = lerp(abc, bcd, t);
        ([a, ab, abc, m], [m, bcd, cd, d])
    }
    let left = if t1 < 1.0 { split(cubic, t1).0 } else { cubic };
    if t0 > 0.0 { split(left, t0 / t1).1 } else { left }
}

/// One stretch of a curve: a cubic in y over [x0, x1], handles at the thirds.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Piece {
    x0: f64,
    x1: f64,
    y: Cubic,
}

fn close(a: f64, b: f64, scale: f64) -> bool {
    (a - b).abs() <= 1e-9 * scale.abs().max(1.0)
}

/// A segment with handles anywhere inside it, as pieces with handles at the
/// thirds: exact when they already are, or are on the straight line; else
/// eight Hermite pieces that follow it closely.
fn thirds(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2) -> Vec<Piece> {
    let width = p3.x - p0.x;
    let scale = p0.y.abs().max(p3.y.abs()).max(width);
    let at = |fraction: f64, handle: Vec2| close(handle.x, p0.x + width * fraction, scale);
    if at(1.0 / 3.0, p1) && at(2.0 / 3.0, p2) {
        return vec![Piece { x0: p0.x, x1: p3.x, y: [p0.y, p1.y, p2.y, p3.y] }];
    }
    let on_line = |handle: Vec2| {
        close((handle.y - p0.y) * width, (p3.y - p0.y) * (handle.x - p0.x), scale * width)
    };
    if on_line(p1) && on_line(p2) {
        let rise = p3.y - p0.y;
        return vec![Piece {
            x0: p0.x,
            x1: p3.x,
            y: [p0.y, p0.y + rise / 3.0, p0.y + rise * 2.0 / 3.0, p3.y],
        }];
    }
    // x(t) never decreases while the handles stay inside the segment, so
    // bisection finds the t for each x.
    let xs: Cubic = [p0.x, p1.x, p2.x, p3.x];
    let ys: Cubic = [p0.y, p1.y, p2.y, p3.y];
    let solve = |x: f64| {
        let (mut low, mut high) = (0.0, 1.0);
        for _ in 0..60 {
            let middle = (low + high) / 2.0;
            if bezier(xs, middle) < x {
                low = middle;
            } else {
                high = middle;
            }
        }
        (low + high) / 2.0
    };
    let slope = |x: f64| {
        let h = width * 1e-4;
        let (a, b) = (p0.x.max(x - h), p3.x.min(x + h));
        (bezier(ys, solve(b)) - bezier(ys, solve(a))) / (b - a)
    };
    const COUNT: usize = 8;
    let knots: Vec<(f64, f64, f64)> = (0..=COUNT)
        .map(|k| {
            let x = p0.x + width * k as f64 / COUNT as f64;
            let t = if k == 0 { 0.0 } else if k == COUNT { 1.0 } else { solve(x) };
            (x, bezier(ys, t), slope(x))
        })
        .collect();
    knots
        .windows(2)
        .map(|pair| {
            let ((x0, y0, s0), (x1, y1, s1)) = (pair[0], pair[1]);
            let h = x1 - x0;
            Piece { x0, x1, y: [y0, y0 + s0 * h / 3.0, y1 - s1 * h / 3.0, y1] }
        })
        .collect()
}

fn flat_point(x: f64, y: f64) -> CurvePoint {
    CurvePoint { x, y, handle_in: Vec2 { x, y }, handle_out: Vec2 { x, y } }
}

/// The point a piece ends at, its handle in at its ⅔.
fn piece_end(piece: &Piece) -> CurvePoint {
    let third = (piece.x1 - piece.x0) / 3.0;
    CurvePoint {
        x: piece.x1,
        y: piece.y[3],
        handle_in: Vec2 { x: piece.x1 - third, y: piece.y[2] },
        handle_out: Vec2 { x: piece.x1, y: piece.y[3] },
    }
}

/// The handle out of a piece's start, at its ⅓.
fn piece_out(piece: &Piece) -> Vec2 {
    Vec2 { x: piece.x0 + (piece.x1 - piece.x0) / 3.0, y: piece.y[1] }
}

/// Points from pieces laid end to end. Touching pieces with the same value
/// share a point; others meet in a jump.
fn from_pieces(pieces: &[Piece]) -> Vec<CurvePoint> {
    let mut points: Vec<CurvePoint> = Vec::new();
    for piece in pieces {
        if !(piece.x1 > piece.x0) {
            continue;
        }
        let shared = matches!(points.last(), Some(last) if last.x == piece.x0 && last.y == piece.y[0]);
        if !shared {
            points.push(flat_point(piece.x0, piece.y[0]));
        }
        points.last_mut().expect("just pushed").handle_out = piece_out(piece);
        points.push(piece_end(piece));
    }
    points
}

/// Check a chain and bring every handle to the thirds.
fn normalise(input: &[CurvePointInput]) -> Result<Vec<CurvePoint>, Error> {
    if input.is_empty() {
        return Err(Error::EmptyCurve);
    }
    for (index, point) in input.iter().enumerate() {
        if !point.y.is_finite() {
            return Err(Error::NonFiniteValue);
        }
        if point.x.is_nan() {
            return Err(Error::NanX);
        }
        if point.x == f64::NEG_INFINITY && index != 0 {
            return Err(Error::NegativeInfinityNotFirst);
        }
        if point.x == f64::INFINITY && index != input.len() - 1 {
            return Err(Error::InfinityNotLast);
        }
        if index > 0 && point.x < input[index - 1].x {
            return Err(Error::Decreasing);
        }
        // An infinite point's handles are ignored.
        if point.x.is_finite() {
            for handle in [point.handle_in, point.handle_out].into_iter().flatten() {
                if !handle.x.is_finite() || !handle.y.is_finite() {
                    return Err(Error::NonFiniteHandle);
                }
            }
        }
    }
    let mut previous = input[0];
    let mut points = vec![flat_point(previous.x, previous.y)];
    for &point in &input[1..] {
        if point.x == previous.x && point.y == previous.y {
            // The same point twice, as where composed curves meet: one point.
            previous.handle_out = point.handle_out;
            continue;
        }
        if !previous.x.is_finite() || !point.x.is_finite() {
            if point.y != previous.y {
                return Err(Error::InfiniteNotFlat);
            }
            points.push(flat_point(point.x, point.y));
        } else if point.x == previous.x {
            if points.len() >= 2 && points[points.len() - 2].x == point.x {
                return Err(Error::TripleJump);
            }
            points.push(flat_point(point.x, point.y));
        } else {
            // A missing handle, or one on its own point, is the straight
            // line, at its third: the knob's default.
            let straight = |handle: Option<Vec2>, at: Vec2, fraction: f64| match handle {
                Some(handle) if !(handle.x == at.x && handle.y == at.y) => handle,
                _ => Vec2 {
                    x: lerp(previous.x, point.x, fraction),
                    y: lerp(previous.y, point.y, fraction),
                },
            };
            let (p0, p3) = (Vec2::new(previous.x, previous.y), Vec2::new(point.x, point.y));
            let p1 = straight(previous.handle_out, p0, 1.0 / 3.0);
            let p2 = straight(point.handle_in, p3, 2.0 / 3.0);
            for handle in [p1, p2] {
                if handle.x < previous.x || handle.x > point.x {
                    return Err(Error::HandleOutside);
                }
            }
            for piece in thirds(p0, p1, p2, p3) {
                points.last_mut().expect("never empty").handle_out = piece_out(&piece);
                points.push(piece_end(&piece));
            }
        }
        previous = point;
    }
    Ok(points)
}

/// Where a curve repeats and where it's flat, worked out once.
#[derive(Clone, Debug)]
struct Shape {
    flat_before: bool,
    flat_after: bool,
    /// The first and last values: what's held past an infinite end.
    before: f64,
    after: f64,
    /// The finite part, from its first point to its last.
    start: f64,
    end: f64,
    span: f64,
    /// No finite points: one value everywhere.
    uniform: bool,
    /// Repeats past its finite ends: unless both ends are infinite, or there
    /// is nothing to repeat (all its points at one x).
    repeats: bool,
    pieces: Vec<Piece>,
}

fn shape_of(points: &[CurvePoint]) -> Shape {
    let flat_before = points[0].x == f64::NEG_INFINITY;
    let flat_after = points[points.len() - 1].x == f64::INFINITY;
    let finite: Vec<&CurvePoint> = points.iter().filter(|point| point.x.is_finite()).collect();
    let pieces = points
        .windows(2)
        .filter(|pair| pair[0].x.is_finite() && pair[1].x.is_finite() && pair[1].x > pair[0].x)
        .map(|pair| Piece {
            x0: pair[0].x,
            x1: pair[1].x,
            y: [pair[0].y, pair[0].handle_out.y, pair[1].handle_in.y, pair[1].y],
        })
        .collect();
    let start = finite.first().map_or(0.0, |point| point.x);
    let end = finite.last().map_or(0.0, |point| point.x);
    Shape {
        flat_before,
        flat_after,
        pieces,
        start,
        end,
        span: end - start,
        before: finite.first().map_or(points[0].y, |point| point.y),
        after: finite.last().map_or(points[0].y, |point| point.y),
        uniform: finite.is_empty(),
        repeats: !(flat_before && flat_after) && end > start,
    }
}

/// The curve at global angle x: its value, and x in its own coordinates if
/// that's a repeating stretch.
fn evaluate(shape: &Shape, x: f64) -> (f64, Option<f64>) {
    if shape.uniform {
        return (shape.before, None);
    }
    if x < shape.start && (shape.flat_before || !shape.repeats) {
        return (shape.before, None);
    }
    if x >= shape.end && (shape.flat_after || !shape.repeats) {
        return (shape.after, None);
    }
    let local = if shape.repeats { shape.start + repeat(x - shape.start, shape.span) } else { x };
    let pieces = &shape.pieces;
    let Some(last) = pieces.len().checked_sub(1) else {
        return (shape.before, None);
    };
    let (mut low, mut high) = (0, last);
    while low < high {
        let middle = (low + high + 1) >> 1;
        if pieces[middle].x0 <= local {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    let piece = &pieces[low];
    let value = bezier(piece.y, (local - piece.x0) / (piece.x1 - piece.x0));
    (value, shape.repeats.then_some(local))
}

// ─── Curve ───────────────────────────────────────────────────────

/// A value over the knob's global angle. Every curve sets its own angle
/// span, and x is always an absolute angle. Curves never change, and clone
/// cheaply.
#[derive(Clone, Debug)]
pub struct Curve(Arc<Inner>);

#[derive(Debug)]
struct Inner {
    points: Vec<CurvePoint>,
    shape: Shape,
}

impl PartialEq for Curve {
    fn eq(&self, other: &Self) -> bool {
        self.0.points == other.0.points
    }
}

impl Curve {
    fn new(points: Vec<CurvePoint>) -> Curve {
        let shape = shape_of(&points);
        Curve(Arc::new(Inner { points, shape }))
    }

    /// One value everywhere: angle span [-∞, ∞]. Fails if `value` isn't finite.
    pub fn uniform(value: f64) -> Result<Curve, Error> {
        Curve::uniform_over(value, AngleSpan::ALL)
    }

    /// One value across `angle`, repeating past finite ends.
    pub fn uniform_over(value: f64, angle: impl Into<AngleSpan>) -> Result<Curve, Error> {
        let AngleSpan { start, end } = angle.into();
        if !(end > start) {
            return Err(Error::EmptySpan);
        }
        Ok(Curve::new(normalise(&[CurvePointInput::new(start, value), CurvePointInput::new(end, value)])?))
    }

    /// `quantity` evenly spaced steps across [0, 360]: the value at x is the
    /// nearest step's angle, so as a target it makes detents.
    pub fn steps(quantity: u32) -> Result<Curve, Error> {
        Curve::steps_over(quantity, AngleSpan::TURN)
    }

    /// `quantity` evenly spaced steps across `angle`, which must be finite.
    pub fn steps_over(quantity: u32, angle: impl Into<AngleSpan>) -> Result<Curve, Error> {
        let AngleSpan { start, end } = angle.into().finite()?;
        if quantity < 1 {
            return Err(Error::NoSteps);
        }
        let width = (end - start) / quantity as f64;
        let mut points = vec![CurvePointInput::new(start, start)];
        for step in 0..quantity {
            let step = step as f64;
            let boundary = start + (step + 0.5) * width;
            points.push(CurvePointInput::new(boundary, start + step * width));
            points.push(CurvePointInput::new(boundary, start + (step + 1.0) * width));
        }
        points.push(CurvePointInput::new(end, end));
        Ok(Curve::new(normalise(&points)?))
    }

    /// Goes from `from` to `to` across [0, 360].
    pub fn ramp(from: f64, to: f64, ease: Ease) -> Result<Curve, Error> {
        Curve::ramp_over(from, to, AngleSpan::TURN, ease)
    }

    /// Goes from `from` to `to` across `angle`, which must be finite.
    pub fn ramp_over(from: f64, to: f64, angle: impl Into<AngleSpan>, ease: Ease) -> Result<Curve, Error> {
        let AngleSpan { start, end } = angle.into().finite()?;
        let (first, second) = ease.handles();
        let (width, rise) = (end - start, to - from);
        Ok(Curve::new(normalise(&[
            CurvePointInput::new(start, from).with_out(start + width / 3.0, from + rise * first),
            CurvePointInput::new(end, to).with_in(end - width / 3.0, from + rise * second),
        ])?))
    }

    /// Joins curves end to end, in order. Each curve keeps its own angle
    /// span. Spans must touch exactly: a gap or overlap fails.
    pub fn compose(curves: &[Curve]) -> Result<Curve, Error> {
        if curves.is_empty() {
            return Err(Error::ComposeEmpty);
        }
        for (index, pair) in curves.windows(2).enumerate() {
            let (previous_end, start) = (pair[0].span().end, pair[1].span().start);
            if previous_end != start {
                return Err(Error::ComposeGap { index: index + 1, start, previous_end });
            }
        }
        let points: Vec<CurvePointInput> =
            curves.iter().flat_map(|curve| curve.points().iter().map(|&point| point.into())).collect();
        Ok(Curve::new(normalise(&points)?))
    }

    /// Escape hatch: build a curve directly from a point chain. Points can be
    /// [`CurvePointInput`]s or `(x, y)` tuples.
    pub fn from_points<P: Into<CurvePointInput>>(points: impl IntoIterator<Item = P>) -> Result<Curve, Error> {
        let points: Vec<CurvePointInput> = points.into_iter().map(Into::into).collect();
        Ok(Curve::new(normalise(&points)?))
    }

    /// The underlying chain, the same data the knob receives (in degrees).
    pub fn points(&self) -> &[CurvePoint] {
        &self.0.points
    }

    /// From the first point's x to the last's.
    pub fn span(&self) -> AngleSpan {
        let points = self.points();
        AngleSpan::new(points[0].x, points[points.len() - 1].x)
    }

    /// The curve's value at a global angle, as the knob computes it.
    pub fn value_at(&self, x: f64) -> f64 {
        evaluate(&self.0.shape, x).0
    }

    /// As a target: the global angle the knob at `x` is pulled toward.
    pub fn target_at(&self, x: f64) -> f64 {
        match evaluate(&self.0.shape, x) {
            (value, None) => value,
            (value, Some(local)) => x + shortest(value - local, self.0.shape.span),
        }
    }

    /// The same values from `from` to `to` (both finite) as pieces, repeats
    /// unrolled. Target values become the global angles they pull to.
    fn slice(&self, from: f64, to: f64, target: bool) -> Result<Vec<Piece>, Error> {
        let shape = &self.0.shape;
        let mut pieces = Vec::new();
        let flat = |pieces: &mut Vec<Piece>, x0: f64, x1: f64, value: f64| {
            if x1 > x0 {
                pieces.push(Piece { x0, x1, y: [value; 4] });
            }
        };
        if !shape.repeats || shape.flat_before {
            flat(&mut pieces, from, to.min(shape.start), shape.before);
        }
        let low = if shape.repeats && !shape.flat_before { from } else { from.max(shape.start) };
        let high = if shape.repeats && !shape.flat_after { to } else { to.min(shape.end) };
        if low < high && !shape.uniform {
            let (first, last) = if shape.repeats {
                (((low - shape.start) / shape.span).floor(), ((high - shape.start) / shape.span).ceil())
            } else {
                (0.0, 1.0)
            };
            if last - first > 1_000.0 {
                return Err(Error::TooManyRepeats);
            }
            for copy in first as i64..last as i64 {
                let shift = if shape.repeats { copy as f64 * shape.span } else { 0.0 };
                for piece in &shape.pieces {
                    let (x0, x1) = (piece.x0 + shift, piece.x1 + shift);
                    let (a, b) = (x0.max(low), x1.min(high));
                    if !(b > a) {
                        continue;
                    }
                    let mut y = piece.y;
                    if target && shape.repeats {
                        // Pulled the short way round, from the piece's start.
                        let offset = shift + shortest(y[0] - piece.x0, shape.span) - (y[0] - piece.x0);
                        y = y.map(|value| value + offset);
                    }
                    pieces.push(Piece { x0: a, x1: b, y: part(y, (a - x0) / (x1 - x0), (b - x0) / (x1 - x0)) });
                }
            }
        }
        if !shape.repeats || shape.flat_after {
            flat(&mut pieces, from.max(shape.end), to, shape.after);
        }
        Ok(pieces)
    }

    /// The curve as `past` (from [`past_wall`]) beyond `angle` on `side`, and
    /// as it was on the other. A flat end already on that side is replaced.
    pub(crate) fn walled(&self, side: WallSide, angle: f64, past: Vec<CurvePoint>, target: bool) -> Result<Curve, Error> {
        if !angle.is_finite() {
            return Err(Error::WallNotFinite);
        }
        let shape = &self.0.shape;
        // A curve that doesn't repeat is flat past its finite part, on both
        // sides, whether or not it says so. (The TypeScript client only
        // handles this for curves with flat ends.)
        let flat_before = shape.flat_before || !shape.repeats;
        let flat_after = shape.flat_after || !shape.repeats;
        // What carries on past the wall: up to the curve's flat end if it has
        // one there, or one span of it repeating if not.
        let points = match side {
            WallSide::Left => {
                let mut rest = if shape.uniform || (flat_after && angle >= shape.end) {
                    vec![flat_point(angle, shape.after), flat_point(f64::INFINITY, shape.after)]
                } else if flat_after {
                    let mut rest = from_pieces(&self.slice(angle, shape.end, target)?);
                    rest.extend([flat_point(shape.end, shape.after), flat_point(f64::INFINITY, shape.after)]);
                    rest
                } else {
                    from_pieces(&self.slice(angle, angle + shape.span, target)?)
                };
                match rest.first() {
                    Some(first) if first.x == angle => {}
                    first => {
                        let y = first.map_or(shape.after, |first| first.y);
                        rest.insert(0, flat_point(angle, y));
                    }
                }
                let mut points = past;
                points.extend(rest);
                points
            }
            WallSide::Right => {
                let mut rest = if shape.uniform || (flat_before && angle <= shape.start) {
                    vec![flat_point(f64::NEG_INFINITY, shape.before), flat_point(angle, shape.before)]
                } else if flat_before {
                    let mut rest =
                        vec![flat_point(f64::NEG_INFINITY, shape.before), flat_point(shape.start, shape.before)];
                    rest.extend(from_pieces(&self.slice(shape.start, angle, target)?));
                    rest
                } else {
                    from_pieces(&self.slice(angle - shape.span, angle, target)?)
                };
                match rest.last() {
                    Some(last) if last.x == angle => {}
                    last => {
                        let y = last.map_or(shape.before, |last| last.y);
                        rest.push(flat_point(angle, y));
                    }
                }
                rest.extend(past);
                rest
            }
        };
        let points: Vec<CurvePointInput> = points.into_iter().map(Into::into).collect();
        Ok(Curve::new(normalise(&points)?))
    }
}

// ─── Curves (per-property builder) ───────────────────────────────

/// A curve, or a number: the same value everywhere.
#[derive(Clone, Debug, PartialEq)]
pub enum CurveInput {
    Value(f64),
    Curve(Curve),
}

impl From<f64> for CurveInput {
    fn from(value: f64) -> Self {
        CurveInput::Value(value)
    }
}

impl From<Curve> for CurveInput {
    fn from(curve: Curve) -> Self {
        CurveInput::Curve(curve)
    }
}

impl From<&Curve> for CurveInput {
    fn from(curve: &Curve) -> Self {
        CurveInput::Curve(curve.clone())
    }
}

impl CurveInput {
    fn into_curve(self) -> Curve {
        match self {
            CurveInput::Curve(curve) => curve,
            CurveInput::Value(value) => {
                Curve::uniform(value).unwrap_or_else(|error| panic!("{error} (got {value})"))
            }
        }
    }
}

/// One of the knob's four curves.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Property {
    /// Where the knob wants to be, in degrees.
    Target,
    /// Added flywheel mass: 0 is the bare knob, 1 is heavy.
    Mass,
    /// How hard it springs toward the target: 0 is no spring, 1 is stiff.
    Tension,
    /// 0 spins freely, 0.5 is the knob's own feel, 1 is heavy.
    Friction,
}

/// The four properties, in the order the knob lists them.
pub const PROPERTIES: [Property; 4] = [Property::Target, Property::Mass, Property::Tension, Property::Friction];

impl Property {
    /// The name the knob uses.
    pub fn name(self) -> &'static str {
        match self {
            Property::Target => "target",
            Property::Mass => "mass",
            Property::Tension => "tension",
            Property::Friction => "friction",
        }
    }
}

/// Beyond a wall: `at_wall`, straight to `far` over `fade` degrees, then held.
fn past_wall(side: WallSide, angle: f64, at_wall: f64, far: f64, fade: f64) -> Vec<CurvePoint> {
    let away = match side {
        WallSide::Left => -1.0,
        WallSide::Right => 1.0,
    };
    let mut points = vec![flat_point(angle, at_wall)];
    if fade > 0.0 {
        points.push(flat_point(angle + away * fade, far));
    }
    points.push(flat_point(away * f64::INFINITY, far));
    if away < 0.0 {
        points.reverse();
    }
    points
}

/// Past a wall, friction fades to 0 over this many degrees.
const WALL_FRICTION_FADE: f64 = 180.0;

/// Options for [`Curves::wall`].
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WallOptions {
    /// Where the wall is, in degrees. Default 0.
    pub angle: f64,
    /// The tension past the wall. Default 1.
    pub tension: f64,
    /// The friction at the wall, fading to 0 over 180° beyond it. Default 1,
    /// so it doesn't bounce.
    pub friction: f64,
}

impl Default for WallOptions {
    fn default() -> Self {
        WallOptions { angle: 0.0, tension: 1.0, friction: 1.0 }
    }
}

impl WallOptions {
    /// A wall at `angle`, with the default tension and friction.
    pub fn at(angle: f64) -> Self {
        WallOptions { angle, ..Default::default() }
    }
}

/// All four properties. Every method returns a new `Curves`; existing ones
/// never change. Start from [`Curves::create`] (or `Default`).
#[derive(Clone, Debug, PartialEq)]
pub struct Curves {
    target: Curve,
    mass: Curve,
    tension: Curve,
    friction: Curve,
}

impl Default for Curves {
    fn default() -> Self {
        Curves::create()
    }
}

impl Curves {
    /// The stock feel: exactly like the motor is off.
    pub fn create() -> Curves {
        let uniform = |value| Curve::uniform(value).expect("finite");
        Curves { target: uniform(0.0), mass: uniform(0.0), tension: uniform(0.0), friction: uniform(0.5) }
    }

    /// One property's curve:
    /// - `Target`: where the knob wants to be, in degrees;
    /// - `Tension`: how hard it springs toward `target`, 0 (no spring) to 1;
    /// - `Mass`: added flywheel mass, 0 (the bare knob) to 1 (heavy);
    /// - `Friction`: 0 spins freely, 0.5 is the knob's own feel, 1 is heavy.
    pub fn get(&self, property: Property) -> &Curve {
        match property {
            Property::Target => &self.target,
            Property::Mass => &self.mass,
            Property::Tension => &self.tension,
            Property::Friction => &self.friction,
        }
    }

    /// Where the knob wants to be, in degrees.
    ///
    /// # Panics
    /// If given a number that isn't finite.
    pub fn target(&self, curve: impl Into<CurveInput>) -> Curves {
        self.with(Property::Target, curve.into().into_curve())
    }

    /// How hard it springs toward the target: 0 is no spring, 1 is stiff.
    ///
    /// # Panics
    /// If given a number that isn't finite.
    pub fn tension(&self, curve: impl Into<CurveInput>) -> Curves {
        self.with(Property::Tension, curve.into().into_curve())
    }

    /// Added flywheel mass: 0 is the bare knob, 1 is heavy.
    ///
    /// # Panics
    /// If given a number that isn't finite.
    pub fn mass(&self, curve: impl Into<CurveInput>) -> Curves {
        self.with(Property::Mass, curve.into().into_curve())
    }

    /// 0 spins freely, 0.5 is the knob's own feel, 1 is heavy.
    ///
    /// # Panics
    /// If given a number that isn't finite.
    pub fn friction(&self, curve: impl Into<CurveInput>) -> Curves {
        self.with(Property::Friction, curve.into().into_curve())
    }

    /// Preset: target = `Curve::steps(quantity)`, tension = 0.5. For another
    /// tension, follow it with `.tension(…)`.
    pub fn detents(&self, quantity: u32) -> Result<Curves, Error> {
        Ok(self.target(Curve::steps(quantity)?).tension(0.5))
    }

    /// Preset: a hard wall at `options.angle`. `Left` covers [-∞, angle],
    /// `Right` covers [angle, ∞]. Past the wall, target is held at `angle`
    /// and tension is set to `options.tension`. Friction is
    /// `options.friction` at the wall, fading to 0 over 180° beyond it. The
    /// rest of the curves stays as it was.
    pub fn wall(&self, side: WallSide, options: WallOptions) -> Result<Curves, Error> {
        let WallOptions { angle, tension, friction } = options;
        Ok(self
            .with(Property::Target, self.target.walled(side, angle, past_wall(side, angle, angle, angle, 0.0), true)?)
            .with(Property::Tension, self.tension.walled(side, angle, past_wall(side, angle, tension, tension, 0.0), false)?)
            .with(Property::Friction, self.friction.walled(side, angle, past_wall(side, angle, friction, 0.0, WALL_FRICTION_FADE), false)?))
    }

    /// The same as [`wall`](Curves::wall).
    pub fn stop(&self, side: WallSide, options: WallOptions) -> Result<Curves, Error> {
        self.wall(side, options)
    }

    fn with(&self, property: Property, curve: Curve) -> Curves {
        let mut next = self.clone();
        match property {
            Property::Target => next.target = curve,
            Property::Mass => next.mass = curve,
            Property::Tension => next.tension = curve,
            Property::Friction => next.friction = curve,
        }
        next
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    fn close(a: f64, b: f64, message: &str) {
        assert!((a - b).abs() < 1e-9, "{message} {a} vs {b}");
    }

    // The firmware's shared vectors: the curve maths here is the knob's.
    #[derive(Deserialize)]
    struct WirePoint {
        x: f64,
        y: f64,
        #[serde(rename = "in")]
        handle_in: Option<f64>,
        out: Option<f64>,
    }

    #[derive(Deserialize)]
    struct VectorCurve {
        points: Vec<WirePoint>,
        #[serde(default)]
        flat_before: bool,
        #[serde(default)]
        flat_after: bool,
    }

    #[derive(Deserialize)]
    struct Case {
        name: String,
        curve: VectorCurve,
        samples: Vec<(f64, f64)>,
    }

    #[test]
    fn curves_match_the_knobs_own_vectors() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../../../../../firmware/knob/core/vectors.json"))
                .unwrap();
        assert!(!cases.is_empty());
        let degrees = |units: f64| units * 360.0 / 65_536.0;
        let mut checked = 0;
        for Case { name, curve, samples } in &cases {
            let all = &curve.points;
            let mut points: Vec<CurvePointInput> = all
                .iter()
                .enumerate()
                .map(|(index, point)| {
                    let mut at = CurvePointInput::new(degrees(point.x), degrees(point.y));
                    if let Some(out) = point.out {
                        let next = &all[index + 1];
                        at = at.with_out(degrees(point.x + (next.x - point.x) / 3.0), degrees(out));
                    }
                    if let Some(handle_in) = point.handle_in {
                        let previous = &all[index - 1];
                        at = at.with_in(degrees(point.x - (point.x - previous.x) / 3.0), degrees(handle_in));
                    }
                    at
                })
                .collect();
            if curve.flat_before {
                points.insert(0, CurvePointInput::new(f64::NEG_INFINITY, points[0].y));
            }
            if curve.flat_after {
                points.push(CurvePointInput::new(f64::INFINITY, points[points.len() - 1].y));
            }
            let built = Curve::from_points(points).unwrap();
            for &(x, value) in samples {
                let units = built.value_at(degrees(x)) * 65_536.0 / 360.0;
                // The knob rounds down, and its fixed point is within a hair of exact.
                assert!(
                    units > value - 1e-3 && units < value + 1.0 + 1e-3,
                    "{name} at {x}: {units} vs {value}"
                );
                checked += 1;
            }
        }
        assert_eq!(checked, cases.iter().map(|case| case.samples.len()).sum::<usize>());
    }

    #[test]
    fn the_usage_examples_build_what_they_say() {
        let detents = Curves::create().detents(24).unwrap().tension(0.5).mass(2.0).friction(1.0);
        assert_eq!(detents.get(Property::Target).target_at(16.0), 15.0);
        assert_eq!(detents.get(Property::Target).target_at(720.0 + 344.0), 720.0 + 345.0);
        assert_eq!(Curves::create().detents(24).unwrap().get(Property::Tension).value_at(0.0), 0.5);

        let halves = Curves::create().tension(0.8).target(Curve::steps(12).unwrap()).mass(
            Curve::compose(&[
                Curve::uniform_over(1.0, (0.0, 180.0)).unwrap(),
                Curve::ramp_over(0.0, 1.0, 180.0..360.0, Ease::In).unwrap(),
            ])
            .unwrap(),
        );
        let mass = halves.get(Property::Mass);
        close(mass.value_at(90.0), 1.0, "");
        close(mass.value_at(180.0), 0.0, "");
        assert!(mass.value_at(270.0) < 0.5, "eases in");
        close(mass.value_at(360.0 + 90.0), 1.0, "repeats");

        // Detents on the first turn, a smooth second turn.
        let two = Curve::compose(&[
            Curve::steps(12).unwrap(),
            Curve::ramp_over(360.0, 720.0, (360.0, 720.0), Ease::Linear).unwrap(),
        ])
        .unwrap();
        assert_eq!(two.target_at(31.0), 30.0);
        close(two.target_at(500.0), 500.0, "");
        assert_eq!(two.target_at(720.0 + 31.0), 720.0 + 30.0);

        let stops = Curves::create()
            .stop(WallSide::Left, WallOptions::at(-270.0))
            .unwrap()
            .stop(WallSide::Right, WallOptions::at(270.0))
            .unwrap();
        assert_eq!(stops.get(Property::Tension).value_at(0.0), 0.0);
        assert_eq!(stops.get(Property::Tension).value_at(-1000.0), 1.0);
        assert_eq!(stops.get(Property::Target).target_at(-1000.0), -270.0);
        assert_eq!(stops.get(Property::Tension).value_at(1000.0), 1.0);
        assert_eq!(stops.get(Property::Target).target_at(1000.0), 270.0);
        close(stops.get(Property::Friction).value_at(270.0), 1.0, "");
        close(stops.get(Property::Friction).value_at(360.0), 0.5, "");
        assert_eq!(stops.get(Property::Friction).value_at(1000.0), 0.0);
        close(stops.get(Property::Friction).value_at(-315.0), 0.75, "");
        assert_eq!(stops.get(Property::Friction).value_at(0.0), 0.5);
    }

    #[test]
    fn builders_never_change() {
        let base = Curves::create();
        let heavy = base.mass(1.0);
        assert_eq!(base.get(Property::Mass).value_at(0.0), 0.0);
        assert_eq!(heavy.get(Property::Mass).value_at(0.0), 1.0);
    }

    #[test]
    fn bad_curves_fail() {
        assert_eq!(Curve::steps_over(4, (0.0, f64::INFINITY)), Err(Error::InfiniteSpan));
        let gap = Curve::compose(&[
            Curve::ramp(0.0, 1.0, Ease::Linear).unwrap(),
            Curve::ramp_over(0.0, 1.0, (400.0, 500.0), Ease::Linear).unwrap(),
        ])
        .unwrap_err();
        assert!(gap.to_string().contains("starts at 400"), "{gap}");
        assert_eq!(Curve::from_points([(5.0, 0.0), (4.0, 0.0)]), Err(Error::Decreasing));
        let flat = Curve::from_points([(f64::NEG_INFINITY, 0.0), (0.0, 1.0)]).unwrap_err();
        assert!(flat.to_string().contains("flat"), "{flat}");
        assert_eq!(Curve::steps(0), Err(Error::NoSteps));
        assert_eq!(Curve::from_points(Vec::<CurvePointInput>::new()), Err(Error::EmptyCurve));
        assert_eq!(Curve::from_points([(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]), Err(Error::TripleJump));
        assert_eq!(
            Curve::from_points([CurvePointInput::new(0.0, 0.0).with_out(-1.0, 0.0), CurvePointInput::new(1.0, 1.0)]),
            Err(Error::HandleOutside)
        );
        assert_eq!(Curves::create().wall(WallSide::Left, WallOptions::at(f64::NAN)), Err(Error::WallNotFinite));
    }

    #[test]
    fn handles_off_the_thirds_follow_the_bezier() {
        // An S-curve with its handles off the thirds (at x = 10 and 45).
        let curve = Curve::from_points([
            CurvePointInput::new(0.0, 0.0).with_out(10.0, 0.0),
            CurvePointInput::new(90.0, 1.0).with_in(45.0, 1.0),
        ])
        .unwrap();
        // Eight Hermite pieces, every handle back at its thirds.
        assert_eq!(curve.points().len(), 9);
        for pair in curve.points().windows(2) {
            let third = (pair[1].x - pair[0].x) / 3.0;
            close(pair[0].handle_out.x, pair[0].x + third, "out at ⅓");
            close(pair[1].handle_in.x, pair[1].x - third, "in at ⅔");
        }
        // It still follows the original Bézier closely.
        let (xs, ys) = ([0.0, 10.0, 45.0, 90.0], [0.0, 0.0, 1.0, 1.0]);
        for t in [0.1, 0.3, 0.5, 0.7, 0.9] {
            let (x, y) = (bezier(xs, t), bezier(ys, t));
            assert!((curve.value_at(x) - y).abs() < 1e-2, "at {x}: {} vs {y}", curve.value_at(x));
        }
        // Handles on the straight line are the straight line.
        let line = Curve::from_points([
            CurvePointInput::new(0.0, 0.0).with_out(10.0, 1.0),
            CurvePointInput::new(90.0, 9.0).with_in(80.0, 8.0),
        ])
        .unwrap();
        assert_eq!(line.points().len(), 2);
        close(line.points()[0].handle_out.y, 3.0, "");
    }

    #[test]
    fn repeats_and_flat_ends() {
        let ramp = Curve::ramp(0.0, 1.0, Ease::Linear).unwrap();
        close(ramp.value_at(-90.0), 0.75, "repeats before");
        close(ramp.value_at(450.0), 0.25, "repeats after");
        let flat = Curve::from_points([
            (f64::NEG_INFINITY, 0.0),
            (0.0, 0.0),
            (360.0, 1.0),
            (f64::INFINITY, 1.0),
        ])
        .unwrap();
        assert_eq!(flat.value_at(-1000.0), 0.0);
        assert_eq!(flat.value_at(1000.0), 1.0);
        // Targets in a flat stretch are global angles; in a repeat, relative.
        assert_eq!(Curve::uniform(30.0).unwrap().target_at(1000.0), 30.0);
        assert_eq!(Curve::uniform_over(30.0, (0.0, 360.0)).unwrap().target_at(1000.0), 1110.0);
        // Exactly half a span goes the negative way.
        assert_eq!(Curve::uniform_over(0.0, (0.0, 360.0)).unwrap().target_at(180.0), 0.0);
        assert_eq!(Curve::uniform_over(0.0, (0.0, 360.0)).unwrap().target_at(181.0), 360.0);
    }

    #[test]
    fn walls_keep_the_rest_of_the_curve() {
        // A wall on a repeating curve unrolls one span of it past the wall.
        let walled = Curves::create().detents(4).unwrap().wall(WallSide::Left, WallOptions::default()).unwrap();
        let target = walled.get(Property::Target);
        assert_eq!(target.target_at(-500.0), 0.0);
        assert_eq!(target.target_at(100.0), 90.0);
        assert_eq!(target.target_at(800.0), 810.0);
        assert_eq!(walled.get(Property::Tension).value_at(-1.0), 1.0);
        assert_eq!(walled.get(Property::Tension).value_at(1.0), 0.5);
        // A curve with nothing to repeat is a step: a wall past it holds.
        let step = Curve::from_points([(0.0, 0.0), (0.0, 1.0)]).unwrap();
        let left = step.walled(WallSide::Left, -10.0, past_wall(WallSide::Left, -10.0, 5.0, 5.0, 0.0), false).unwrap();
        assert_eq!((left.value_at(-20.0), left.value_at(-5.0), left.value_at(5.0)), (5.0, 0.0, 1.0));
        let right = step.walled(WallSide::Right, 10.0, past_wall(WallSide::Right, 10.0, 5.0, 5.0, 0.0), false).unwrap();
        assert_eq!((right.value_at(-5.0), right.value_at(5.0), right.value_at(20.0)), (0.0, 1.0, 5.0));
    }
}
