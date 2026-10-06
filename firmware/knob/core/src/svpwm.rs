//! Space-vector PWM: a voltage on the rotor's d/q axes becomes three phase
//! duty cycles. SVPWM reaches supply/√3, about 15% more than plain sine.

use crate::units::{Ratio, Volts};
use fixed::types::I16F16;
use foc::park_clarke::{RotatingReferenceFrame, inverse_park};
use foc::pwm::{Modulation, SpaceVector};

/// The PWM counter's top value: 40 MHz / 2000 = 20 kHz.
pub const PWM_PERIOD: u16 = 1_999;
/// √3, for the SVPWM ceiling.
const SQRT_3: Volts = Volts::lit("1.7320508076");

/// Every phase at half duty: zero volts across the motor, windings shorted.
pub const SHORTED: [u16; 3] = [PWM_PERIOD.div_ceil(2); 3];

/// How much of SVPWM's range one volt is: √3 / supply. Worked out once, so a
/// tick multiplies instead of dividing.
pub fn per_volt(supply: Volts) -> Ratio {
    SQRT_3 / supply
}

/// Duty cycles for `d` and `q` volts at `electrical` (a `u16` turn fraction).
/// `per_volt` comes from [`per_volt`].
pub fn duties(d: Volts, q: Volts, electrical: u16, per_volt: Ratio) -> [u16; 3] {
    // foc's space vector of length 1 is the ceiling, supply/√3.
    let scale = |volts: Volts| I16F16::saturating_from_num(volts * per_volt);
    let (cos, sin) = idsp::cossin(i32::from(electrical as i16) << 16);
    // idsp gives Q31; foc wants 16 fractional bits.
    let (cos, sin) = (I16F16::from_bits(cos >> 15), I16F16::from_bits(sin >> 15));
    let stationary = inverse_park(cos, sin, RotatingReferenceFrame { d: scale(d), q: scale(q) });
    SpaceVector::as_compare_value::<PWM_PERIOD>(stationary)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn phase_voltages(duty: [u16; 3], supply: f64) -> [f64; 3] {
        let volts = duty.map(|d| f64::from(d) / f64::from(PWM_PERIOD + 1) * supply);
        let mean = volts.iter().sum::<f64>() / 3.0;
        volts.map(|v| v - mean)
    }

    #[test]
    fn zero_volts_is_centred() {
        assert_eq!(duties(Volts::ZERO, Volts::ZERO, 12_345, per_volt(Volts::from_num(5))), SHORTED);
    }

    #[test]
    fn a_d_axis_field_points_at_its_angle() {
        let supply = 5.0;
        for (angle, phase) in [(0u16, 0usize), (21_845, 1), (43_690, 2)] {
            let v = phase_voltages(duties(Volts::from_num(1), Volts::ZERO, angle, per_volt(Volts::from_num(supply))), supply);
            assert!((v[phase] - 1.0).abs() < 0.01, "{angle}: {v:?}");
        }
    }

    #[test]
    fn q_leads_d_by_a_quarter_turn() {
        let scale = per_volt(Volts::from_num(5));
        assert_eq!(duties(Volts::ZERO, Volts::from_num(1), 0, scale), duties(Volts::from_num(1), Volts::ZERO, 16_384, scale));
    }

    #[test]
    fn the_ceiling_is_supply_over_root_three_without_clipping() {
        let supply = 5.0;
        let ceiling = supply / 3f64.sqrt();
        for angle in (0..=u16::MAX).step_by(331) {
            let duty = duties(Volts::from_num(ceiling * 0.999), Volts::ZERO, angle, per_volt(Volts::from_num(supply)));
            let v = phase_voltages(duty, supply);
            let amplitude = ((v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) * 2.0 / 3.0).sqrt();
            assert!((amplitude - ceiling).abs() < 0.02, "{angle}: {amplitude}");
        }
    }
}
