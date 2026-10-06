//! Finding the magnet: which electrical angle the rotor is at for each encoder
//! reading. It depends on how the magnet was glued, so every knob finds it for
//! itself at boot: hold a field at a few electrical angles, see where the
//! rotor settles each time, and fit.

use crate::motion::Motion;
use crate::output::Drive;
use crate::units::{CONTROL_HZ, Turns, Volts, angle_of};
use serde::Serialize;

/// Field strength: enough to pull the rotor past its cogging, gently.
const FIELD: Volts = Volts::lit("1");
/// Electrical angles to hold, out and back so cogging averages out.
const STEPS: [u16; 5] = [0, 16_384, 32_768, 16_384, 0];
/// Each hold lasts 100 ms; its last 20 ms, once settled, are averaged.
const HOLD_TICKS: u32 = CONTROL_HZ as u32 / 10;
const SETTLED_TICKS: u32 = CONTROL_HZ as u32 / 50;
/// A beep, then a pause to take your hand off, before every attempt.
const BEEP_TICKS: u32 = CONTROL_HZ as u32 * 15 / 100;
const WARNING_TICKS: u32 = CONTROL_HZ as u32;
/// The fitted zeros may disagree by up to 1/16 electrical turn.
const MAX_SPREAD: i32 = 4_096;

/// How encoder angles map to electrical angles.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct Commutation {
    pub pole_pairs: u8,
    /// +1 if the encoder counts the same way as the electrical angle, else −1.
    pub direction: i8,
    /// The electrical angle at encoder zero, negated: a `u16` turn fraction.
    pub zero: u16,
}

impl Commutation {
    /// This knob's magnets, if tuning.toml lists its ID.
    pub fn known(id: &str) -> Option<Self> {
        let &(_, direction, zero) = crate::tuning::MAGNETS.iter().find(|(known, ..)| *known == id)?;
        Some(Self { pole_pairs: crate::tuning::POLE_PAIRS, direction, zero })
    }

    /// The rotor's electrical angle when the encoder reads `rotor`.
    pub fn electrical(&self, rotor: u16) -> u16 {
        let turned = i32::from(rotor) * i32::from(self.pole_pairs) * i32::from(self.direction);
        (turned as u16).wrapping_sub(self.zero)
    }

    /// q-axis volts that push the encoder forward by `push` volts.
    pub fn forward(&self, push: Volts) -> Volts {
        push * i64::from(self.direction)
    }
}

pub struct Aligner {
    pole_pairs: u8,
    step: usize,
    ticks: u32,
    settled: Turns,
    rests: [Turns; STEPS.len()],
    resting: u32,
}

impl Aligner {
    pub fn new(pole_pairs: u8) -> Self {
        Self { pole_pairs, step: 0, ticks: 0, settled: Turns::ZERO, rests: [Turns::ZERO; STEPS.len()], resting: WARNING_TICKS }
    }

    /// Start over, with a fresh warning: after a failed fit, or an encoder glitch.
    pub fn restart(&mut self) {
        *self = Self::new(self.pole_pairs);
    }

    /// Whether to beep now: the start of the warning before the knob moves.
    pub fn beeping(&self) -> bool {
        self.resting > WARNING_TICKS - BEEP_TICKS
    }

    /// One tick: what to drive, and, once every hold is done, the result.
    pub fn step(&mut self, motion: &Motion) -> (Drive, Option<Result<Commutation, &'static str>>) {
        if self.resting > 0 {
            self.resting -= 1;
            return (Drive::Off, None);
        }
        self.ticks += 1;
        if self.ticks > HOLD_TICKS - SETTLED_TICKS {
            self.settled += motion.position;
        }
        if self.ticks == HOLD_TICKS {
            self.rests[self.step] = self.settled / i64::from(SETTLED_TICKS);
            (self.step, self.ticks, self.settled) = (self.step + 1, 0, Turns::ZERO);
            if self.step == STEPS.len() {
                let result = fit(self.rests, self.pole_pairs);
                if result.is_err() {
                    self.restart();
                }
                return (Drive::Off, Some(result));
            }
        }
        (Drive::Field { volts: FIELD, electrical: STEPS[self.step] }, None)
    }
}

/// Where the rotor settled for each field, as a commutation.
fn fit(rests: [Turns; STEPS.len()], pole_pairs: u8) -> Result<Commutation, &'static str> {
    // Half an electrical turn apart should be half a pole pair apart.
    let half = rests[2] - rests[0];
    let expected = Turns::ONE / i64::from(2 * pole_pairs);
    if half.abs() < expected / 2 || half.abs() > expected * 3 / 2 {
        return Err("alignment_failed: the rotor didn't follow the field; hands off the knob at power-on");
    }
    let direction = if half > 0 { 1 } else { -1 };
    let raw = Commutation { pole_pairs, direction, zero: 0 };
    // Each hold gives a zero; average them as offsets from the first.
    let zeros = core::array::from_fn::<u16, { STEPS.len() }, _>(|i| raw.electrical(angle_of(rests[i])).wrapping_sub(STEPS[i]));
    let offsets = zeros.map(|zero| i32::from(zero.wrapping_sub(zeros[0]) as i16));
    if offsets.iter().any(|offset| offset.abs() > MAX_SPREAD) {
        return Err("alignment_failed: the holds disagree; hands off the knob at power-on");
    }
    let mean = offsets.iter().sum::<i32>() / STEPS.len() as i32;
    Ok(Commutation { zero: zeros[0].wrapping_add(mean as u16), ..raw })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Rests for a rotor whose true zero is `zero`, turning `direction`.
    fn rests(zero: u16, direction: i8, wobble: f64) -> [Turns; 5] {
        let base = 3.0 + f64::from(zero) / 65_536.0 / 7.0 * f64::from(direction);
        core::array::from_fn(|i| {
            let field = f64::from(STEPS[i]) / 65_536.0;
            let noise = if i % 2 == 0 { wobble } else { -wobble };
            Turns::from_num(base + f64::from(direction) * field / 7.0 + noise)
        })
    }

    #[test]
    fn finds_the_zero_and_direction() {
        for direction in [1, -1] {
            for zero in [0u16, 12_345, 57_106] {
                let found = fit(rests(zero, direction, 0.0005), 7).unwrap();
                assert_eq!(found.direction, direction);
                let error = i32::from(found.zero.wrapping_sub(zero) as i16);
                assert!(error.abs() < 300, "{zero}, {direction}: off by {error}");
                // The fitted commutation puts each rest at its field.
                let rest = rests(zero, direction, 0.0)[1];
                let electrical = found.electrical(angle_of(rest));
                assert!(i32::from(electrical.wrapping_sub(16_384) as i16).abs() < 300);
            }
        }
    }

    #[test]
    fn known_knobs_come_from_tuning_toml() {
        let this = Commutation::known("40-4c-ca-5c-3c-24").expect("the T-Knob in tuning.toml");
        assert_eq!((this.pole_pairs, this.direction), (7, -1));
        assert_eq!(Commutation::known("00-00-00-00-00-00"), None);
    }

    #[test]
    fn a_held_knob_fails() {
        assert!(fit([Turns::from_num(0.3); 5], 7).is_err());
    }

    #[test]
    fn a_full_run_holds_each_field_then_reports() {
        let mut aligner = Aligner::new(7);
        assert!(aligner.beeping());
        let still = Motion::default();
        let mut result = None;
        let mut ticks = 0;
        while result.is_none() {
            let (drive, done) = aligner.step(&still);
            result = done;
            ticks += 1;
            let warned = ticks > WARNING_TICKS;
            assert_eq!(matches!(drive, Drive::Field { .. }), warned && result.is_none(), "tick {ticks}");
        }
        assert_eq!(ticks, WARNING_TICKS + STEPS.len() as u32 * HOLD_TICKS);
        // A knob that never moved fails, and the aligner rests before retrying.
        assert!(result.unwrap().is_err());
        assert_eq!(aligner.step(&still).0, Drive::Off);
    }
}
