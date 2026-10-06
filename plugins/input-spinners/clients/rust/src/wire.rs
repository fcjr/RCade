//! The wire: exactly what the knob sends and receives, as JSON. The shapes
//! match the TypeScript client's `Wire*` types and the firmware's
//! `PROTOCOL.md`.

use serde::{Deserialize, Deserializer, Serialize, Serializer};

use crate::curve::{Curve, CurvePoint, Curves, Property};
use crate::rumble::{RumbleInput, RumbleOptions, vibrations, warn};
use crate::{
    Error, MAX_DELAY_MS, MAX_DURATION_MS, MAX_POINTS, MAX_PULSES, degrees_to_units, fraction_to_units, js_round,
};

/// Which knob: player 1 or 2. On the wire, the number.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Player {
    One = 1,
    Two = 2,
}

impl Player {
    pub(crate) fn index(self) -> usize {
        self as usize - 1
    }
}

impl Serialize for Player {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_u8(*self as u8)
    }
}

impl<'de> Deserialize<'de> for Player {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        match u8::deserialize(deserializer)? {
            1 => Ok(Player::One),
            2 => Ok(Player::Two),
            other => Err(serde::de::Error::custom(format!("no player {other}"))),
        }
    }
}

fn is_false(value: &bool) -> bool {
    !*value
}

/// A curve point on the wire: x in 1/65536 turn; y (and the handles' y) in
/// 1/65536 turn for `target`, 1/65536 of 1 for the others. Handles left out
/// are the straight line.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WirePoint {
    pub x: i64,
    pub y: i64,
    #[serde(rename = "in", default, skip_serializing_if = "Option::is_none")]
    pub handle_in: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub out: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireCurve {
    pub points: Vec<WirePoint>,
    /// Sent as `true`, or left out.
    #[serde(default, skip_serializing_if = "is_false")]
    pub flat_before: bool,
    /// Sent as `true`, or left out.
    #[serde(default, skip_serializing_if = "is_false")]
    pub flat_after: bool,
}

/// One number (the same everywhere) or a curve.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum WireSetting {
    Value(i64),
    Curve(WireCurve),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WireConfig {
    pub target: WireSetting,
    pub mass: WireSetting,
    pub tension: WireSetting,
    pub friction: WireSetting,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WirePulse {
    pub delay_ms: u32,
    pub duration_ms: u32,
    pub intensity: u16,
}

/// How the knob found its magnet at boot.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Magnet {
    pub pole_pairs: u32,
    /// 1 or -1.
    pub direction: i8,
    pub zero: i64,
}

/// What a game sends the cabinet for one knob. `id`s come back on the
/// command's ack or error.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WireCommand {
    pub player: Player,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<u64>,
    #[serde(flatten)]
    pub body: WireCommandBody,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireCommandBody {
    Hello,
    Config {
        config: WireConfig,
    },
    /// Where the knob was at `reference` now counts as `global_angle`; any
    /// turning since `reference` was read is kept. Without a reference:
    /// where the knob is now.
    Tare {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        reference: Option<i64>,
        global_angle: i64,
    },
    /// Back to the stock feel; stops any rumble.
    Reset,
    /// Stop the knob spinning: an event, the curves stay.
    Brake,
    Rumble {
        pulses: Vec<WirePulse>,
    },
}

impl WireCommandBody {
    /// The `type` on the wire.
    pub fn kind(&self) -> &'static str {
        match self {
            WireCommandBody::Hello => "hello",
            WireCommandBody::Config { .. } => "config",
            WireCommandBody::Tare { .. } => "tare",
            WireCommandBody::Reset => "reset",
            WireCommandBody::Brake => "brake",
            WireCommandBody::Rumble { .. } => "rumble",
        }
    }
}

/// What the cabinet sends a game about one knob.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WireMessage {
    /// `device` is "rcade-tknob", or for now the cabinet's old spinner.
    /// `magnet` is `None` until the knob has found it (it can't push yet).
    Hello {
        player: Player,
        #[serde(default)]
        device: String,
        #[serde(default)]
        id: String,
        #[serde(default)]
        magnet: Option<Magnet>,
        #[serde(default)]
        max_points: u32,
    },
    /// In 1/65536 turns since boot or a tare: `global_angle` is where the
    /// knob is, `curve_angle` where the curves are read (the knob's
    /// flywheel). `velocity_q16` is the curve angle's, turns/s in 1/65536.
    /// `angle` is the raw encoder.
    Tick {
        player: Player,
        angle: i64,
        global_angle: i64,
        curve_angle: i64,
        velocity_q16: i64,
        time_us: u64,
    },
    Status {
        player: Player,
        #[serde(default)]
        reason: String,
    },
    Ack {
        player: Player,
        command: String,
        #[serde(default)]
        id: Option<u64>,
        #[serde(default)]
        time_us: u64,
    },
    Error {
        #[serde(default)]
        player: Option<Player>,
        message: String,
        #[serde(default)]
        id: Option<u64>,
    },
    Connection {
        player: Player,
        connected: bool,
        #[serde(default)]
        message: String,
    },
    /// Anything else (dev-only messages, newer protocols): ignored.
    #[serde(other)]
    Other,
}

impl WireMessage {
    /// The knob it's about, if it's about one.
    pub fn player(&self) -> Option<Player> {
        match self {
            WireMessage::Hello { player, .. }
            | WireMessage::Tick { player, .. }
            | WireMessage::Status { player, .. }
            | WireMessage::Ack { player, .. }
            | WireMessage::Connection { player, .. } => Some(*player),
            WireMessage::Error { player, .. } => *player,
            WireMessage::Other => None,
        }
    }
}

// ─── Conversion ──────────────────────────────────────────────────

fn points_to_wire(points: &[CurvePoint], target: bool) -> Result<WireSetting, Error> {
    let value = |y: f64| if target { degrees_to_units(y) } else { fraction_to_units(y) as i64 };
    let flat_before = points[0].x == f64::NEG_INFINITY;
    let flat_after = points[points.len() - 1].x == f64::INFINITY;
    let finite: Vec<&CurvePoint> = points.iter().filter(|point| point.x.is_finite()).collect();
    if finite.is_empty() {
        return Ok(WireSetting::Value(value(points[0].y)));
    }
    if finite.len() > MAX_POINTS {
        return Err(Error::TooManyPoints { count: finite.len() });
    }
    let mut wire: Vec<WirePoint> = finite
        .iter()
        .map(|point| WirePoint { x: degrees_to_units(point.x), y: value(point.y), handle_in: None, out: None })
        .collect();
    for (index, pair) in finite.windows(2).enumerate() {
        let (point, next) = (pair[0], pair[1]);
        if next.x == point.x {
            continue;
        }
        // Handles on the straight line are left out: the knob's default.
        let (y0, y3) = (wire[index].y as f64, wire[index + 1].y as f64);
        let (out, into) = (value(point.handle_out.y), value(next.handle_in.y));
        if out as f64 != js_round(y0 + (y3 - y0) / 3.0) || into as f64 != js_round(y0 + (y3 - y0) * 2.0 / 3.0) {
            wire[index].out = Some(out);
            wire[index + 1].handle_in = Some(into);
        }
    }
    if wire.windows(3).any(|three| three[0].x == three[2].x) {
        return Err(Error::PointsTooClose);
    }
    Ok(WireSetting::Curve(WireCurve { points: wire, flat_before, flat_after }))
}

/// One curve as the knob receives it. `target` curves are in degrees, the
/// others in 0..1.
pub fn curve_to_wire(curve: &Curve, target: bool) -> Result<WireSetting, Error> {
    points_to_wire(curve.points(), target)
}

/// All four curves as the knob receives them.
pub fn curves_to_wire(curves: &Curves) -> Result<WireConfig, Error> {
    Ok(WireConfig {
        target: curve_to_wire(curves.get(Property::Target), true)?,
        mass: curve_to_wire(curves.get(Property::Mass), false)?,
        tension: curve_to_wire(curves.get(Property::Tension), false)?,
        friction: curve_to_wire(curves.get(Property::Friction), false)?,
    })
}

/// A rumble as the knob's pulses, or `None` (with a warning) if it can't
/// play: an unknown preset, a negative or non-finite time, or more than
/// [`MAX_PULSES`] vibrations. Durations are clamped to 1000 ms and delays to
/// 5000 ms.
pub fn pulses_to_wire(input: impl Into<RumbleInput>, options: RumbleOptions) -> Option<Vec<WirePulse>> {
    let list = vibrations(&input.into())?;
    let valid = |value: f64| value.is_finite() && value >= 0.0;
    if !list.iter().all(|item| valid(item.duration) && valid(item.delay)) {
        warn("Invalid vibration values. Durations and delays must be finite non-negative numbers.");
        return None;
    }
    if list.len() > MAX_PULSES {
        warn(&format!("A rumble has at most {MAX_PULSES} vibrations; this one has {}.", list.len()));
        return None;
    }
    let unit = |value: f64| value.clamp(0.0, 1.0);
    let fallback = unit(options.intensity);
    Some(
        list.iter()
            .map(|item| WirePulse {
                delay_ms: js_round(item.delay).min(MAX_DELAY_MS) as u32,
                duration_ms: js_round(item.duration).min(MAX_DURATION_MS) as u32,
                intensity: fraction_to_units(unit(item.intensity.unwrap_or(fallback))),
            })
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curve::{CurvePointInput, Ease, WallOptions, WallSide};
    use crate::rumble::{RumblePreset, Vibration};
    use serde_json::json;

    #[test]
    fn rumbles_take_web_haptics_patterns() {
        let default = RumbleOptions::default;
        // Like web-haptics' trigger: unset intensities take the option, default 0.5.
        assert_eq!(
            pulses_to_wire(200, default()),
            Some(vec![WirePulse { delay_ms: 0, duration_ms: 200, intensity: 32_768 }])
        );
        assert_eq!(pulses_to_wire(200, RumbleOptions::intensity(1.0)).unwrap()[0].intensity, 65_535);
        let on_off: Vec<(u32, u32)> = pulses_to_wire([100, 50, 100], default())
            .unwrap()
            .iter()
            .map(|pulse| (pulse.delay_ms, pulse.duration_ms))
            .collect();
        assert_eq!(on_off, vec![(0, 100), (50, 100)]);
        // A preset's own intensities win over the option.
        assert_eq!(pulses_to_wire("heavy", RumbleOptions::intensity(0.2)).unwrap()[0].intensity, 65_535);
        assert_eq!(pulses_to_wire(RumblePreset::Heavy, RumbleOptions::intensity(0.2)).unwrap()[0].intensity, 65_535);
        assert_eq!(
            pulses_to_wire(RumbleInput::default(), default()),
            Some(vec![WirePulse { delay_ms: 0, duration_ms: 25, intensity: js_round(0.7 * 65_536.0) as u16 }])
        );
        assert_eq!(pulses_to_wire(5_000, default()).unwrap()[0].duration_ms, 1_000, "clamped to a second");
        let delayed = pulses_to_wire([Vibration::new(40.0).with_delay(9_000.0).with_intensity(2.0)], default());
        assert_eq!(delayed, Some(vec![WirePulse { delay_ms: 5_000, duration_ms: 40, intensity: 65_535 }]));
        // Nothing plays, with a warning, rather than failing mid-game.
        assert_eq!(pulses_to_wire("nope", default()), None);
        assert_eq!(pulses_to_wire([Vibration::new(-1.0)], default()), None);
        assert_eq!(pulses_to_wire(f64::NAN, default()), None);
        assert_eq!(pulses_to_wire(vec![10.0; 40], default()), None, "more pulses than the knob holds");
    }

    #[test]
    fn values_over_one_clamp() {
        let detents = Curves::create().detents(24).unwrap().tension(0.5).mass(2.0).friction(1.0);
        let wire = curves_to_wire(&detents).unwrap();
        assert_eq!(wire.mass, WireSetting::Value(65_535), "2 is clamped to 1");
        assert_eq!(wire.friction, WireSetting::Value(65_535));
        assert_eq!(wire.tension, WireSetting::Value(32_768));
    }

    #[test]
    fn wire_shapes_match_the_typescript_client() {
        // Straight handles are left out; others are sent as their y.
        let ramp = Curve::ramp_over(0.0, 1.0, (0.0, 90.0), Ease::In).unwrap();
        assert_eq!(
            serde_json::to_value(curve_to_wire(&ramp, false).unwrap()).unwrap(),
            json!({ "points": [{ "x": 0, "y": 0, "out": 0 }, { "x": 16384, "y": 65535, "in": 21845 }] })
        );
        let walled = Curves::create().wall(WallSide::Left, WallOptions::at(90.0)).unwrap();
        let config = curves_to_wire(&walled).unwrap();
        assert_eq!(
            serde_json::to_value(&config).unwrap(),
            json!({
                "target": { "points": [{ "x": 16384, "y": 16384 }, { "x": 16384, "y": 0 }], "flat_before": true, "flat_after": true },
                "mass": 0,
                "tension": { "points": [{ "x": 16384, "y": 65535 }, { "x": 16384, "y": 0 }], "flat_before": true, "flat_after": true },
                "friction": { "points": [{ "x": -16384, "y": 0, "out": 21845 }, { "x": 16384, "y": 65535, "in": 43691 }, { "x": 16384, "y": 32768 }], "flat_before": true, "flat_after": true },
            })
        );
        let command = |id, body| serde_json::to_value(WireCommand { player: Player::Two, id, body }).unwrap();
        assert_eq!(command(None, WireCommandBody::Hello), json!({ "player": 2, "type": "hello" }));
        assert_eq!(
            command(Some(3), WireCommandBody::Tare { reference: Some(-5), global_angle: 16384 }),
            json!({ "player": 2, "id": 3, "type": "tare", "reference": -5, "global_angle": 16384 })
        );
        assert_eq!(
            command(Some(4), WireCommandBody::Config { config: config.clone() }),
            json!({ "player": 2, "id": 4, "type": "config", "config": serde_json::to_value(&config).unwrap() })
        );
        assert_eq!(
            command(Some(5), WireCommandBody::Rumble {
                    pulses: pulses_to_wire(RumblePreset::Rigid, RumbleOptions::intensity(1.0)).unwrap()
                }),
            json!({ "player": 2, "id": 5, "type": "rumble", "pulses": [{ "delay_ms": 0, "duration_ms": 10, "intensity": 65535 }] })
        );
        assert_eq!(command(Some(6), WireCommandBody::Reset), json!({ "player": 2, "id": 6, "type": "reset" }));
        assert_eq!(command(Some(7), WireCommandBody::Brake), json!({ "player": 2, "id": 7, "type": "brake" }));
    }

    #[test]
    fn messages_parse() {
        let parse = |value: serde_json::Value| serde_json::from_value::<WireMessage>(value).unwrap();
        assert_eq!(
            parse(json!({ "type": "tick", "player": 1, "angle": 5, "global_angle": -70000, "curve_angle": -70100, "velocity_q16": -3, "time_us": 123 })),
            WireMessage::Tick { player: Player::One, angle: 5, global_angle: -70000, curve_angle: -70100, velocity_q16: -3, time_us: 123 }
        );
        assert_eq!(
            parse(json!({ "type": "hello", "player": 2, "device": "rcade-tknob", "id": "aa:bb", "magnet": null, "max_points": 128 })),
            WireMessage::Hello {
                player: Player::Two,
                device: "rcade-tknob".into(),
                id: "aa:bb".into(),
                magnet: None,
                max_points: 128
            }
        );
        assert_eq!(
            parse(json!({ "type": "error", "message": "nope" })),
            WireMessage::Error { player: None, message: "nope".into(), id: None }
        );
        assert_eq!(parse(json!({ "type": "stats", "player": 1 })), WireMessage::Other);
    }

    #[test]
    fn curves_too_big_for_the_wire_fail() {
        let many = Curve::steps(100).unwrap();
        assert_eq!(curve_to_wire(&many, true), Err(Error::TooManyPoints { count: 202 }));
        let close = Curve::from_points([
            CurvePointInput::new(0.0, 0.0),
            CurvePointInput::new(0.0, 1.0),
            CurvePointInput::new(0.001, 0.0),
        ])
        .unwrap();
        assert_eq!(curve_to_wire(&close, false), Err(Error::PointsTooClose));
    }
}
