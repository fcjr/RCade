//! Input and haptics for RCade's T-Knob spinners: read the knobs, shape how
//! they feel, and rumble them.
//!
//! Games work in degrees and 0..1; the knob works in integers (1/65536 turn),
//! and this crate converts both ways.
//!
//! ```no_run
//! use rcade_plugin_input_spinners::{Curve, Curves, Ease, RumbleOptions, P1};
//!
//! # async fn demo() -> Result<(), rcade_plugin_input_spinners::Error> {
//! // Keep the subscription: dropping it unsubscribes.
//! let _moves = P1.subscribe(|event| {
//!     let _turned = event.delta_angle; // degrees since the last event
//! });
//! let state = P1.read();
//! let _ = (state.angle, state.global_angle);
//!
//! P1.set_curves(&Curves::create().detents(24)?).await?;
//! P1.set_curves(&Curves::create().mass(0.25).friction(0.0)).await?;
//! P1.set_curves(&Curves::create().detents(12)?.tension(Curve::ramp(0.0, 1.0, Ease::Linear)?)).await?;
//! P1.rumble("success", RumbleOptions::default());
//! P1.tare(0.0).await?;
//! # Ok(())
//! # }
//! ```
//!
//! The plugin channel (`@rcade/input-spinners`, `^2.0.0`) is acquired on
//! first use. Outside a browser (tests, tools) it never opens: the curve maths
//! works and the spinners stay still.

mod curve;
mod rumble;
mod spinner;
mod wire;

#[cfg(target_arch = "wasm32")]
mod js;

pub use curve::{
    AngleSpan, Curve, CurveInput, CurvePoint, CurvePointInput, Curves, Ease, PROPERTIES, Property,
    Vec2, WallOptions, WallSide,
};
pub use rumble::{RumbleInput, RumbleOptions, RumblePattern, RumblePreset, Vibration, rumble_presets, vibrations};
pub use spinner::{Ack, P1, P2, Spinner, SpinnerEvent, SpinnerState, Subscription, spinner};
pub use wire::{
    Magnet, Player, WireCommand, WireCommandBody, WireConfig, WireCurve, WireMessage, WirePoint,
    WirePulse, WireSetting, curve_to_wire, curves_to_wire, pulses_to_wire,
};

use std::fmt;

// ─── Units ───────────────────────────────────────────────────────

/// One turn, and 1.0, on the wire.
pub const TURN_UNITS: i64 = 65_536;
/// The most points a curve may send, not counting infinite ends.
pub const MAX_POINTS: usize = 128;
/// The most pulses in one rumble.
pub const MAX_PULSES: usize = 16;
/// The longest pause before a pulse, ms: the knob's limit.
const MAX_DELAY_MS: f64 = 5_000.0;
/// web-haptics' longest vibration, ms.
const MAX_DURATION_MS: f64 = 1_000.0;

const TURN: f64 = TURN_UNITS as f64;

/// JavaScript's `Math.round`: halves go up, toward +∞ (Rust's `round` goes
/// away from zero), so the wire values match the TypeScript client's.
pub(crate) fn js_round(value: f64) -> f64 {
    let floor = value.floor();
    if value - floor >= 0.5 { floor + 1.0 } else { floor }
}

/// Degrees as the knob's angle units (1/65536 turn).
pub fn degrees_to_units(degrees: f64) -> i64 {
    js_round(degrees / 360.0 * TURN) as i64
}

/// The knob's angle units (1/65536 turn) as degrees.
pub fn units_to_degrees(units: i64) -> f64 {
    units as f64 * 360.0 / TURN
}

/// A 0..1 value in 1/65536, clamped: 1 (or more) becomes 65535, the closest
/// the knob gets, and 1 is already the strongest that doesn't ring.
pub fn fraction_to_units(value: f64) -> u16 {
    js_round(value * TURN).clamp(0.0, TURN - 1.0) as u16
}

// ─── Errors ──────────────────────────────────────────────────────

/// Everything that can go wrong: a curve that can't be built or sent, or a
/// command the knob didn't confirm. (A bad rumble only logs a warning.)
#[derive(Clone, Debug, PartialEq)]
pub enum Error {
    /// A curve needs at least one point.
    EmptyCurve,
    /// A point's value (y) is NaN or infinite.
    NonFiniteValue,
    /// A handle of a finite point is NaN or infinite.
    NonFiniteHandle,
    /// A point's x is NaN.
    NanX,
    /// Only the first point may be at -∞.
    NegativeInfinityNotFirst,
    /// Only the last point may be at +∞.
    InfinityNotLast,
    /// Curve x must never decrease.
    Decreasing,
    /// Segments with an infinite end must be flat.
    InfiniteNotFlat,
    /// A jump is two points with the same x, not three.
    TripleJump,
    /// Handles must stay inside their segment's x-range.
    HandleOutside,
    /// This curve needs a finite angle span.
    InfiniteSpan,
    /// A curve's angle span must end after it starts.
    EmptySpan,
    /// `steps` needs at least one step.
    NoSteps,
    /// `compose` needs at least one curve.
    ComposeEmpty,
    /// `compose`: curve `index` starts at `start`, not where the one before ends.
    ComposeGap { index: usize, start: f64, previous_end: f64 },
    /// Unrolling the curve (for a wall) would take too many repeats.
    TooManyRepeats,
    /// A wall needs a finite angle.
    WallNotFinite,
    /// A curve can send at most [`MAX_POINTS`] points.
    TooManyPoints { count: usize },
    /// Curve points are too close together on the wire: three points share an x.
    PointsTooClose,
    /// The spinner hasn't said hello (or has gone away).
    NotConnected(Player),
    /// The knob didn't answer this command within 2 s.
    Timeout { command: &'static str },
    /// The cabinet or the knob refused the command.
    Knob(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::EmptyCurve => f.write_str("A curve needs at least one point."),
            Error::NonFiniteValue => f.write_str("Curve values must be finite numbers."),
            Error::NonFiniteHandle => f.write_str("Curve handles must be finite numbers."),
            Error::NanX => f.write_str("Curve x must be a number."),
            Error::NegativeInfinityNotFirst => f.write_str("Only the first point may be at -Infinity."),
            Error::InfinityNotLast => f.write_str("Only the last point may be at Infinity."),
            Error::Decreasing => f.write_str("Curve x must never decrease."),
            Error::InfiniteNotFlat => f.write_str("Segments with an infinite end must be flat."),
            Error::TripleJump => f.write_str("A jump is two points with the same x, not three."),
            Error::HandleOutside => f.write_str("Handles must stay inside their segment's x-range."),
            Error::InfiniteSpan => f.write_str("This curve needs a finite angle span."),
            Error::EmptySpan => f.write_str("A curve's angle span must end after it starts."),
            Error::NoSteps => f.write_str("steps needs a whole number of steps, at least 1."),
            Error::ComposeEmpty => f.write_str("compose needs at least one curve."),
            Error::ComposeGap { index, start, previous_end } => write!(
                f,
                "compose: curve {index} starts at {start}°, not where the one before ends ({previous_end}°)."
            ),
            Error::TooManyRepeats => f.write_str("That would unroll too many repeats of the curve."),
            Error::WallNotFinite => f.write_str("A wall needs a finite angle."),
            Error::TooManyPoints { count } => {
                write!(f, "A curve can send at most {MAX_POINTS} points; this one has {count}.")
            }
            Error::PointsTooClose => f.write_str(
                "Curve points are too close together: keep jumps at least 1/65536 turn apart.",
            ),
            Error::NotConnected(player) => write!(f, "Spinner P{} is not connected.", *player as u8),
            Error::Timeout { command } => write!(f, "The knob didn't answer {command} in time."),
            Error::Knob(message) => f.write_str(message),
        }
    }
}

impl std::error::Error for Error {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn conversions_match_the_knob() {
        assert_eq!(degrees_to_units(90.0), 16_384);
        assert_eq!(degrees_to_units(-3.0 * 360.0), -196_608);
        assert_eq!(units_to_degrees(16_384), 90.0);
        assert_eq!(fraction_to_units(0.5), 32_768);
        assert_eq!(fraction_to_units(1.0), 65_535);
        assert_eq!(fraction_to_units(2.0), 65_535);
        assert_eq!(fraction_to_units(-1.0), 0);
    }

    #[test]
    fn rounding_is_javascripts() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(-2.6), -3.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        // Half a unit, negative: JS rounds toward +∞.
        assert_eq!(degrees_to_units(-0.5 * 360.0 / 65_536.0), 0);
    }
}
