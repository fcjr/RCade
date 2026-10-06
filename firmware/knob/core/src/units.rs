//! The numbers the knob thinks in.
//!
//! The ESP32-C6 has no FPU, so the physics uses 64-bit fixed point: 32 integer
//! bits and 32 fractional bits. The names say what each number measures.
//!
//! On the wire, numbers are plain integers:
//! - angles count 1/65536 turn. The encoder `angle` is a `u16` within one
//!   turn; the `global_angle` and curve coordinates are `i64` and keep counting
//!   whole turns;
//! - curve values for mass, tension and friction are fractions of 65536, so
//!   32768 is exactly one half and 65535 is as close to 1 as they get;
//! - everything else is `_q16`: the `i32` bits of a number with 16 fractional
//!   bits. Clients do the conversion to and from floats.

use fixed::types::I32F32;

/// Angle or position, in turns.
pub type Turns = I32F32;
/// Angular velocity, in turns per second.
pub type TurnsPerSec = I32F32;
/// Motor voltage. All torque is expressed as the voltage that produces it.
pub type Volts = I32F32;
/// A plain number: a gain, a fraction, a multiple of the knob's inertia.
pub type Ratio = I32F32;

/// The control loop's rate, one tick per PWM period.
pub const CONTROL_HZ: i64 = 20_000;

/// A `_q16` integer from the wire or the tuning.
pub fn from_q16(bits: i32) -> I32F32 {
    I32F32::from_bits(i64::from(bits) << 16)
}

/// A number as `_q16` bits for the wire, saturating at the `i32` range.
pub fn to_q16(value: I32F32) -> i32 {
    (value.to_bits() >> 16).clamp(i32::MIN.into(), i32::MAX.into()) as i32
}

/// `numerator / denominator` with 64-bit integer division. Dividing two
/// I32F32 numbers directly needs 128-bit division, a slow software routine on
/// this CPU; the tick can't afford it. The quotient keeps 16 fractional bits,
/// and saturates if it doesn't fit.
pub fn divide(numerator: I32F32, denominator: I32F32) -> I32F32 {
    let denominator = denominator.to_bits() >> 16;
    if denominator == 0 {
        return if numerator >= 0 { I32F32::MAX } else { I32F32::MIN };
    }
    // Long division in two 64-bit steps, 16 quotient bits each, so the result
    // keeps all 32 fractional bits. One step alone left the flywheel's speed
    // in steps of 2⁻¹⁶ turns/s, which a heavy flywheel turned into 48 mV
    // jumps in force: a staircase you could feel.
    let numerator = numerator.to_bits();
    let coarse = numerator / denominator;
    let fine = (numerator % denominator).checked_mul(1 << 16).map_or(0, |rest| rest / denominator);
    I32F32::from_bits(coarse.saturating_mul(1 << 16).saturating_add(fine))
}

/// A count of 1/65536 turns (an angle, or a curve value) as a number.
pub fn from_units(units: i64) -> I32F32 {
    I32F32::from_bits(units << 16)
}

/// A position as a count of 1/65536 turns, rounded down.
pub fn to_units(position: Turns) -> i64 {
    position.to_bits() >> 16
}

/// The `u16` turn fraction of a position, dropping whole turns.
pub fn angle_of(position: Turns) -> u16 {
    to_units(position) as u16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn q16_round_trips() {
        for bits in [0, 1, -1, 65_536, -3_000_000, i32::MAX, i32::MIN] {
            assert_eq!(to_q16(from_q16(bits)), bits);
        }
        assert_eq!(to_q16(I32F32::from_num(1.5)), 98_304);
    }

    #[test]
    fn divide_matches_full_division_to_sixteen_bits() {
        for (a, b) in [(3.0, 0.9), (-7.25, 0.0125), (0.001, 2.5), (1000.0, -0.37), (0.0, 5.0)] {
            let (x, y) = (I32F32::from_num(a), I32F32::from_num(b));
            let error = (divide(x, y) - x / y).abs();
            assert!(error < I32F32::from_num(1e-3) * (x / y).abs().max(I32F32::ONE), "{a}/{b}: {error}");
        }
        assert_eq!(divide(I32F32::ONE, I32F32::ZERO), I32F32::MAX);
    }

    #[test]
    fn divide_keeps_full_precision_for_a_heavy_flywheel() {
        // The flywheel at mass 1 divides by about 3137: the quotient must not
        // come out in steps, or its force does.
        let heavy = I32F32::from_num(3137);
        for a in [1.0, 2.5, -7.3, 0.000_1] {
            let x = I32F32::from_num(a);
            assert!((divide(x, heavy) - x / heavy).abs() <= I32F32::DELTA * 2, "{a}");
        }
    }

    #[test]
    fn units_are_sixty_five_thousandths_of_a_turn() {
        assert_eq!(from_units(32_768), I32F32::from_num(0.5));
        assert_eq!(from_units(-196_608), I32F32::from_num(-3));
        assert_eq!(to_units(from_units(-12_345_678)), -12_345_678);
        assert_eq!(angle_of(Turns::from_num(-0.25)), 49_152);
    }
}
