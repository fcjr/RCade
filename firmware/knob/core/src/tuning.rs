//! The numbers the knob's feel depends on: `tuning.toml`, built in. See that
//! file for what each means.
//!
//! Every field is the `_q16` bits of a number in turns, seconds and volts.

use crate::units::{Ratio, Volts, from_q16};

include!(concat!(env!("OUT_DIR"), "/tuning.rs"));

/// 1/√3.
const FRAC_1_SQRT_3: Ratio = Ratio::lit("0.5773502692");
/// The TMC6300 runs from 2 to 11 V.
const SUPPLY_RANGE: core::ops::RangeInclusive<i32> = 2 << 16..=11 << 16;
/// A rumble's buzz must be slower than half the tick rate to be a sine at all.
const RUMBLE_HZ_RANGE: core::ops::RangeInclusive<i32> = 1 << 16..=5_000 << 16;

#[derive(Clone, Debug, PartialEq)]
pub struct Tuning {
    pub supply_q16: i32,
    pub accel_q16: i32,
    pub back_emf_q16: i32,
    pub emf_cancel_q16: i32,
    pub dead_time_q16: i32,
    pub drag_coulomb_q16: i32,
    pub drag_viscous_q16: i32,
    pub coupling_stiffness_q16: i32,
    pub coupling_damping_q16: i32,
    pub mass_q16: i32,
    pub tension_q16: i32,
    pub friction_q16: i32,
    pub drag_cancel_q16: i32,
    pub rumble_q16: i32,
    pub rumble_hz_q16: i32,
}

impl Tuning {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !SUPPLY_RANGE.contains(&self.supply_q16) {
            return Err("supply must be 2 to 11 V");
        }
        if self.accel_q16 <= 0 || self.coupling_stiffness_q16 <= 0 {
            return Err("accel and coupling stiffness must be positive");
        }
        if self.emf_cancel_q16 > 1 << 16 || self.drag_cancel_q16 > 1 << 16 {
            return Err("cancelling more than all of a drag would push the knob by itself");
        }
        if !RUMBLE_HZ_RANGE.contains(&self.rumble_hz_q16) {
            return Err("rumble_hz must be 1 to 5000 Hz");
        }
        let rest = [self.back_emf_q16, self.emf_cancel_q16, self.dead_time_q16, self.drag_coulomb_q16, self.drag_viscous_q16,
            self.coupling_damping_q16, self.mass_q16, self.tension_q16, self.friction_q16, self.drag_cancel_q16, self.rumble_q16];
        if rest.iter().any(|&value| value < 0) {
            return Err("tuning values can't be negative");
        }
        Ok(())
    }

    /// The most voltage SVPWM can put across the motor, in every direction.
    pub fn voltage_limit(&self) -> Volts {
        from_q16(self.supply_q16) * FRAC_1_SQRT_3
    }

    pub fn supply(&self) -> Volts {
        from_q16(self.supply_q16)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_built_in_tuning_is_valid() {
        assert_eq!(Tuning::DEFAULT.validate(), Ok(()));
        assert_eq!(POLE_PAIRS, 7);
        let limit = Tuning::DEFAULT.voltage_limit().to_num::<f64>();
        assert!((limit - 2.887).abs() < 0.001, "{limit}");
    }

    #[test]
    fn nonsense_is_rejected() {
        let mut tuning = Tuning::DEFAULT;
        tuning.mass_q16 = -1;
        assert!(tuning.validate().is_err());
        tuning = Tuning::DEFAULT;
        tuning.supply_q16 = 12 << 16;
        assert!(tuning.validate().is_err());
        tuning = Tuning::DEFAULT;
        tuning.rumble_hz_q16 = 0;
        assert!(tuning.validate().is_err());
    }
}
