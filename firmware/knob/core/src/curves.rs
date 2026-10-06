//! The four curves a game sends, and baking them for the control loop.
//!
//! A curve is a chain of points over the knob's global angle. Each pair of
//! neighbouring points is a cubic Bézier whose handles sit at ⅓ and ⅔ of the
//! way across, so only the handles' values are sent, and the curve parameter
//! is simply how far across we are. Angles never decrease: two points at the
//! same angle make a jump.
//!
//! The chain covers its first point's angle to its last's. Past an end it
//! repeats (the curve at x is the curve at start + (x − start) mod (end −
//! start)), unless that end is flat: then it holds the end's value forever.
//!
//! Angles count 1/65536 turn. Mass, tension and friction values are fractions
//! of 65536. Target values are angles. Where the chain repeats, they are in
//! its own coordinates and repeat with it, so the knob is pulled toward the
//! target the short way round. Past a flat end, or in a chain with both ends
//! flat, they are global angles.
//!
//! Any of the four can instead be a single number: the same everywhere. That
//! is tiny to send and free to evaluate, for games that set things directly.
//! A uniform target is a global angle.
//!
//! Baking only works out each segment's constants, so a new config is ready
//! in microseconds; the control loop evaluates the curves every tick.

use crate::units::{Ratio, Turns, divide, from_units};
use alloc::vec::Vec;
use core::fmt;
use serde::{Deserialize, Deserializer, Serialize, Serializer, de};

/// Enough for 64 detents and their ends.
pub const MAX_POINTS: usize = 130;
/// Coordinates stay within ±2^44 units (±2^28 turns), so their differences
/// always fit the fixed-point maths.
pub const MAX_COORDINATE: i64 = 1 << 44;
/// One turn, in angle units.
pub const TURN: i64 = 65_536;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: i64,
    pub y: i64,
    /// The value of the handle before this point, at ⅔ of the segment;
    /// defaults to the straight line.
    #[serde(rename = "in", default, skip_serializing_if = "Option::is_none")]
    pub incoming: Option<i64>,
    /// The value of the handle after this point, at ⅓ of the segment;
    /// defaults to the straight line.
    #[serde(rename = "out", default, skip_serializing_if = "Option::is_none")]
    pub outgoing: Option<i64>,
}

fn is_false(value: &bool) -> bool {
    !value
}

/// As sent: the points are only as many as the game used, up to `MAX_POINTS`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Curve {
    pub points: Vec<Point>,
    /// Before the first point, hold its value instead of repeating.
    #[serde(default, skip_serializing_if = "is_false")]
    pub flat_before: bool,
    /// After the last point, hold its value instead of repeating.
    #[serde(default, skip_serializing_if = "is_false")]
    pub flat_after: bool,
}

/// One of the four: the same everywhere, or a curve over the angle. On the
/// wire, a plain number or a curve object.
#[derive(Clone, Debug, PartialEq)]
pub enum Setting {
    Uniform(i64),
    Curve(Curve),
}

/// Where the knob wants to be (`target`), and how it gets there: added
/// `mass`, spring `tension` toward the target, and `friction`.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub target: Setting,
    pub mass: Setting,
    pub tension: Setting,
    pub friction: Setting,
}

/// What the curves say at one angle.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Feel {
    /// How far the target is from here (the short way round, where it repeats).
    pub to_target: Turns,
    pub mass: Ratio,
    pub tension: Ratio,
    pub friction: Ratio,
}

/// Friction's stock value: the knob's own drag, no more, no less.
pub const STOCK_FRICTION: Ratio = Ratio::lit("0.5");

impl Feel {
    /// The motor-off feel: no added mass, no spring, the knob's own friction.
    pub const STOCK: Feel = Feel { to_target: Turns::ZERO, mass: Ratio::ZERO, tension: Ratio::ZERO, friction: STOCK_FRICTION };
}

/// Whether a value fits: targets are angles, the others fractions of 65536.
fn in_range(value: i64, target: bool) -> bool {
    if target { (-MAX_COORDINATE..=MAX_COORDINATE).contains(&value) } else { (0..TURN).contains(&value) }
}

impl Setting {
    pub fn validate(&self, target: bool) -> Result<(), &'static str> {
        match self {
            Setting::Uniform(value) if in_range(*value, target) => Ok(()),
            Setting::Uniform(_) => Err("setting value is out of range"),
            Setting::Curve(curve) => curve.validate(target),
        }
    }

    pub fn bake_into(&self, out: &mut Baked) {
        match self {
            Setting::Uniform(value) => *out = Baked::Uniform(from_units(*value)),
            Setting::Curve(curve) => {
                if !matches!(out, Baked::Curve(_)) {
                    *out = Baked::Curve(BakedCurve::default());
                }
                let Baked::Curve(baked) = out else { unreachable!() };
                curve.bake_into(baked);
            }
        }
    }
}

impl Serialize for Setting {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Setting::Uniform(value) => serializer.serialize_i64(*value),
            Setting::Curve(curve) => curve.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for Setting {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct NumberOrCurve;
        impl<'de> de::Visitor<'de> for NumberOrCurve {
            type Value = Setting;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                f.write_str("a number or a curve")
            }
            fn visit_i64<E: de::Error>(self, value: i64) -> Result<Setting, E> {
                Ok(Setting::Uniform(value))
            }
            fn visit_u64<E: de::Error>(self, value: u64) -> Result<Setting, E> {
                i64::try_from(value).map(Setting::Uniform).map_err(|_| E::custom("number is too large"))
            }
            fn visit_map<A: de::MapAccess<'de>>(self, map: A) -> Result<Setting, A::Error> {
                Curve::deserialize(de::value::MapAccessDeserializer::new(map)).map(Setting::Curve)
            }
        }
        deserializer.deserialize_any(NumberOrCurve)
    }
}

impl Curve {
    /// `target` curves hold angles; the others hold fractions of 65536.
    pub fn validate(&self, target: bool) -> Result<(), &'static str> {
        if self.points.is_empty() || self.points.len() > MAX_POINTS {
            return Err("curve needs 1 to 130 points");
        }
        if self.points.iter().any(|p| !(-MAX_COORDINATE..=MAX_COORDINATE).contains(&p.x)) {
            return Err("curve x is out of range");
        }
        if self.points.windows(2).any(|pair| pair[0].x > pair[1].x) {
            return Err("curve x must never decrease");
        }
        if self.points.windows(3).any(|three| three[0].x == three[2].x) {
            return Err("a jump is two points at one x, not three");
        }
        let values = self.points.iter().flat_map(|p| [Some(p.y), p.incoming, p.outgoing]).flatten();
        if !values.into_iter().all(|value| in_range(value, target)) {
            return Err("curve value or handle is out of range");
        }
        Ok(())
    }

    /// Work out each segment's constants into `out`.
    pub fn bake_into(&self, out: &mut BakedCurve) {
        let points = &self.points;
        let (first, last) = (points[0], points[points.len() - 1]);
        out.start = from_units(first.x);
        out.end = from_units(last.x);
        out.span = out.end - out.start;
        out.repeats = !(self.flat_before && self.flat_after) && last.x > first.x;
        out.hold_before = self.flat_before || !out.repeats;
        out.hold_after = self.flat_after || !out.repeats;
        out.first = from_units(first.y);
        out.last = from_units(last.y);
        out.segments.clear();
        for pair in points.windows(2) {
            let (start, end) = (pair[0], pair[1]);
            if end.x == start.x {
                continue; // a jump: no width, nothing to evaluate
            }
            let rise = from_units(end.y - start.y);
            let handle = |handle: Option<i64>, default: Turns| handle.map_or(default, |value| from_units(value - start.y));
            let segment = Segment {
                from: from_units(start.x),
                per_turn: divide(Ratio::ONE, from_units(end.x - start.x)),
                value: from_units(start.y),
                straight: start.outgoing.is_none() && end.incoming.is_none(),
                controls: [handle(start.outgoing, rise / 3), handle(end.incoming, rise * 2 / 3), rise],
            };
            let _ = out.segments.push(segment);
        }
    }

    pub fn bake(&self) -> BakedCurve {
        let mut baked = BakedCurve::default();
        self.bake_into(&mut baked);
        baked
    }
}

impl Config {
    /// Stock curves: the knob feels exactly like the motor is off.
    pub fn stock() -> Self {
        Self {
            target: Setting::Uniform(0),
            mass: Setting::Uniform(0),
            tension: Setting::Uniform(0),
            friction: Setting::Uniform(STOCK_FRICTION.to_bits() >> 16),
        }
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        self.target.validate(true)?;
        [&self.mass, &self.tension, &self.friction].into_iter().try_for_each(|setting| setting.validate(false))
    }

    /// Bake all four curves into `out`, which the control loop then swaps in.
    pub fn bake_into(&self, out: &mut Feelings) {
        self.target.bake_into(&mut out.target);
        self.mass.bake_into(&mut out.mass);
        self.tension.bake_into(&mut out.tension);
        self.friction.bake_into(&mut out.friction);
    }

    pub fn bake(&self) -> Feelings {
        let mut feelings = Feelings::default();
        self.bake_into(&mut feelings);
        feelings
    }
}

/// One segment of a baked curve, from one point to the next.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
struct Segment {
    /// Where the segment starts.
    from: Turns,
    /// 1 / its length, so a tick multiplies instead of dividing.
    per_turn: Ratio,
    /// The value at its start.
    value: Turns,
    /// Its handles are on the straight line: no need for the cubic.
    straight: bool,
    /// The handles as offsets from `value`; the last is the rise to the next
    /// point, which is all a straight segment uses.
    controls: [Turns; 3],
}

/// A curve, ready to evaluate.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BakedCurve {
    /// The first and last points' angles, and how far apart they are.
    start: Turns,
    end: Turns,
    span: Turns,
    /// Past its ends, it repeats.
    repeats: bool,
    /// Before `start` or from `end` on, it holds `first` or `last`.
    hold_before: bool,
    hold_after: bool,
    first: Turns,
    last: Turns,
    /// Fixed room for every segment, so baking never allocates.
    segments: heapless::Vec<Segment, MAX_POINTS>,
}

impl BakedCurve {
    /// The curve at global angle `x`, and, where it repeats, `x` in the
    /// curve's own coordinates.
    pub fn at(&self, x: Turns) -> (Turns, Option<Turns>) {
        if x < self.start && self.hold_before {
            return (self.first, None);
        }
        if x >= self.end && self.hold_after {
            return (self.last, None);
        }
        let local = if self.repeats { self.start + repeat(x - self.start, self.span) } else { x };
        let index = self.segments.partition_point(|segment| segment.from <= local) - 1;
        let segment = &self.segments[index];
        let along = (local - segment.from) * segment.per_turn;
        let [first_handle, second_handle, rise] = segment.controls;
        let offset = if segment.straight { rise * along } else { bezier([Turns::ZERO, first_handle, second_handle, rise], along) };
        (segment.value + offset, self.repeats.then_some(local))
    }
}

/// A setting, ready to evaluate.
#[derive(Clone, Debug, PartialEq)]
pub enum Baked {
    Uniform(Turns),
    Curve(BakedCurve),
}

impl Default for Baked {
    fn default() -> Self {
        Baked::Uniform(Turns::ZERO)
    }
}

impl Baked {
    /// The value at global angle `x`.
    pub fn value(&self, x: Turns) -> Turns {
        match self {
            Baked::Uniform(value) => *value,
            Baked::Curve(curve) => curve.at(x).0,
        }
    }

    /// For a target: how far it is from global angle `x`. Where the curve
    /// repeats, its target repeats with it, so the short way round;
    /// elsewhere the target is a global angle.
    fn to_target(&self, x: Turns) -> Turns {
        match self {
            Baked::Uniform(target) => *target - x,
            Baked::Curve(curve) => match curve.at(x) {
                (target, Some(here)) => shortest(target - here, curve.span),
                (target, None) => target - x,
            },
        }
    }
}

/// All four curves, ready for the control loop.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Feelings {
    target: Baked,
    mass: Baked,
    tension: Baked,
    friction: Baked,
}

impl Feelings {
    /// Stock curves, baked: the same as `Config::stock().bake()`, but built
    /// at compile time, so these big values never pass through a stack.
    pub const STOCK: Feelings = Feelings {
        target: Baked::Uniform(Turns::ZERO),
        mass: Baked::Uniform(Turns::ZERO),
        tension: Baked::Uniform(Turns::ZERO),
        friction: Baked::Uniform(STOCK_FRICTION),
    };

    /// What the curves say with the knob (or flywheel) at global angle `x`.
    pub fn at(&self, x: Turns) -> Feel {
        Feel {
            to_target: self.target.to_target(x),
            mass: self.mass.value(x),
            tension: self.tension.value(x),
            friction: self.friction.value(x),
        }
    }
}

/// `offset` brought into 0..span by whole spans.
fn repeat(offset: Turns, span: Turns) -> Turns {
    if offset >= 0 && offset < span {
        return offset; // the usual case, without a division
    }
    Turns::from_bits(offset.to_bits().rem_euclid(span.to_bits()))
}

/// `difference` brought into −span/2..span/2 by whole spans: the short way
/// round. Exactly half a span goes the negative way.
fn shortest(difference: Turns, span: Turns) -> Turns {
    let half = span / 2;
    if difference >= -half && difference < half {
        return difference;
    }
    repeat(difference + half, span) - half
}

/// A cubic Bézier by de Casteljau: repeated linear interpolation.
fn bezier(mut points: [Turns; 4], t: Ratio) -> Turns {
    for level in (1..4).rev() {
        for i in 0..level {
            points[i] += (points[i + 1] - points[i]) * t;
        }
    }
    points[0]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point(x: i64, y: i64) -> Point {
        Point { x, y, incoming: None, outgoing: None }
    }

    fn chain(points: &[(i64, i64)]) -> Curve {
        Curve { points: points.iter().map(|&(x, y)| point(x, y)).collect(), flat_before: false, flat_after: false }
    }

    fn turns(value: Turns) -> f64 {
        value.to_num()
    }

    /// The same curve worked out in f64, straight from the definition.
    fn reference(curve: &Curve, x: f64) -> f64 {
        let points = &curve.points;
        let (start, end) = (points[0].x as f64, points[points.len() - 1].x as f64);
        let repeats = !(curve.flat_before && curve.flat_after) && end > start;
        let unit = |value: i64| value as f64 / TURN as f64;
        if x < start && (curve.flat_before || !repeats) {
            return unit(points[0].y);
        }
        if x >= end && (curve.flat_after || !repeats) {
            return unit(points[points.len() - 1].y);
        }
        let local = if repeats { start + (x - start).rem_euclid(end - start) } else { x };
        let index = points.iter().rposition(|p| p.x as f64 <= local && points.iter().any(|q| q.x > p.x)).unwrap();
        let (a, b) = (points[index], points[index + 1]);
        let t = (local - a.x as f64) / (b.x - a.x) as f64;
        let rise = (b.y - a.y) as f64;
        let p1 = a.outgoing.map_or(rise / 3.0, |value| (value - a.y) as f64);
        let p2 = b.incoming.map_or(rise * 2.0 / 3.0, |value| (value - a.y) as f64);
        let u = 1.0 - t;
        unit(a.y) + (3.0 * u * u * t * p1 + 3.0 * u * t * t * p2 + t * t * t * rise) / TURN as f64
    }

    #[test]
    fn baked_curves_match_the_definition_across_repeats() {
        let mut wiggly = chain(&[(-1_000, 5_000), (9_000, 60_000), (30_000, 20_000), (40_000, 5_000)]);
        wiggly.points[0].outgoing = Some(65_535);
        wiggly.points[3].incoming = Some(0);
        let mut walled = chain(&[(0, 100), (70_000, 30_000), (70_000, 2_000), (100_000, 2_000)]);
        walled.flat_before = true;
        let mut both = chain(&[(-5_000, 65_000), (0, 10), (5_000, 400)]);
        (both.flat_before, both.flat_after) = (true, true);
        let cases = [chain(&[(1_000, 0), (40_000, 65_535), (66_536, 0)]), wiggly, walled, both];
        for curve in &cases {
            curve.validate(false).unwrap();
            let baked = curve.bake();
            for x in (-400_000..400_000).step_by(997) {
                let (value, _) = baked.at(from_units(x));
                let expected = reference(curve, x as f64);
                assert!((turns(value) - expected).abs() < 1e-6, "{x}: {} vs {expected}", turns(value));
            }
        }
    }

    #[test]
    fn past_either_end_the_curve_repeats() {
        let baked = chain(&[(100, 0), (2_600, 60_000), (5_100, 0)]).bake();
        for x in [100, 1_234, 5_099] {
            let here = baked.at(from_units(x)).0;
            assert_eq!(baked.at(from_units(x + 5_000 * 7)).0, here);
            assert_eq!(baked.at(from_units(x - 5_000 * 3)).0, here);
        }
    }

    #[test]
    fn a_jump_takes_the_later_value_at_its_angle() {
        let baked = chain(&[(0, 0), (1_000, 0), (1_000, 50_000), (2_000, 50_000)]).bake();
        assert_eq!(baked.at(from_units(999)).0, from_units(0));
        assert_eq!(baked.at(from_units(1_000)).0, from_units(50_000));
    }

    #[test]
    fn flat_ends_hold_and_their_targets_are_global() {
        // A wall: past 0 the target holds at 0; inside, detents every quarter turn.
        let mut points = std::vec![(0, 0)];
        points.extend((0..4).flat_map(|i| [(i * 16_384 + 8_192, i * 16_384), (i * 16_384 + 8_192, (i + 1) * 16_384)]));
        points.push((TURN, TURN));
        let mut curve = chain(&points);
        curve.flat_before = true;
        let mut config = Config::stock();
        config.target = Setting::Curve(curve);
        config.validate().unwrap();
        let feelings = config.bake();
        let to_target = |x: i64| turns(feelings.at(from_units(x)).to_target) * TURN as f64;
        // Three turns before the wall: pulled all the way back.
        assert_eq!(to_target(-3 * TURN), 3.0 * TURN as f64);
        // After it, the detents repeat, the short way round.
        assert_eq!(to_target(100), -100.0);
        assert_eq!(to_target(5 * TURN + 16_000), 384.0);
        assert_eq!(to_target(TURN - 10), 10.0);
    }

    #[test]
    fn a_target_that_rises_a_whole_turn_keeps_pulling_ahead() {
        // The target is always 10 units ahead: the knob spins forever.
        let mut config = Config::stock();
        config.target = Setting::Curve(chain(&[(0, 10), (TURN, TURN + 10)]));
        let feelings = config.bake();
        for x in [-70_000, 0, 32_767, 65_535, 300_000] {
            assert_eq!(feelings.at(from_units(x)).to_target, from_units(10), "{x}");
        }
    }

    #[test]
    fn a_uniform_setting_is_one_number_everywhere() {
        let config: Config = serde_json::from_str(r#"{"target": -131072, "mass": 0, "tension": 52428, "friction": 32768}"#).unwrap();
        config.validate().unwrap();
        let feel = config.bake().at(from_units(5 * TURN));
        assert_eq!(feel.tension, from_units(52_428));
        // A uniform target is a global angle: seven turns away is seven turns.
        assert_eq!(feel.to_target, from_units(-7 * TURN));
        assert_eq!(serde_json::to_string(&config.mass).unwrap(), "0");
        let too_heavy: Config = serde_json::from_str(r#"{"target": 0, "mass": 70000, "tension": 0, "friction": 0}"#).unwrap();
        assert!(too_heavy.validate().is_err());
    }

    #[test]
    fn curves_parse_from_the_wire() {
        let json = r#"{"points":[{"x":0,"y":0,"out":100},{"x":10,"y":5,"in":2}],"flat_after":true}"#;
        let setting: Setting = serde_json::from_str(json).unwrap();
        let Setting::Curve(curve) = &setting else { panic!("expected a curve") };
        assert_eq!(curve.points[0].outgoing, Some(100));
        assert!(curve.flat_after && !curve.flat_before);
        assert_eq!(serde_json::to_string(&setting).unwrap(), json);
    }

    #[test]
    fn stock_curves_are_the_stock_feel() {
        let feelings = Config::stock().bake();
        for x in [-9_999_999, 0, 12_345, 3 * TURN] {
            // The target doesn't matter: with no tension it pulls with nothing.
            let feel = feelings.at(from_units(x));
            assert_eq!(Feel { to_target: Turns::ZERO, ..feel }, Feel::STOCK);
        }
    }

    #[test]
    fn the_built_in_stock_bank_is_stock() {
        assert_eq!(Feelings::STOCK, Config::stock().bake());
    }

    #[test]
    fn a_single_point_holds_everywhere() {
        let baked = chain(&[(500, 1_234)]).bake();
        for x in [-100_000, 500, 100_000] {
            assert_eq!(baked.at(from_units(x)), (from_units(1_234), None));
        }
    }

    #[test]
    fn validation_rejects_bad_curves() {
        assert!(chain(&[]).validate(false).is_err());
        assert!(chain(&[(5, 0), (4, 1)]).validate(false).is_err());
        assert!(chain(&[(5, 0), (5, 1)]).validate(false).is_ok(), "a jump");
        assert!(chain(&[(5, 0), (5, 1), (5, 2)]).validate(false).is_err());
        assert!(chain(&[(0, 65_536)]).validate(false).is_err());
        assert!(chain(&[(0, -5 * TURN)]).validate(true).is_ok());
        assert!(Config::stock().validate().is_ok());
    }
}
