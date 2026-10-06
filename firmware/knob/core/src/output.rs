//! Turning a wanted push into what the motor driver does.
//!
//! The motor is voltage-driven with no current sensor, so the push it gives is
//! `volts − back-EMF`. This adds the back-EMF back, makes up the voltage the
//! driver's dead time eats, and never lets the spinning motor charge the supply.

use crate::motion::Motion;
use crate::tuning::Tuning;
use crate::units::{Ratio, Volts, divide, from_q16};

/// Dead-time compensation fades in over 0.1 V of drive, so it doesn't flip
/// sign on noise around zero. Kept as its reciprocal: the tick multiplies.
const PER_DEAD_TIME_RAMP: Ratio = Ratio::lit("10");

/// What the driver should do this tick.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Drive {
    /// All gates off: the motor-off feel.
    Off,
    /// Windings shorted: brakes with the full back-EMF, and the energy stays
    /// in the windings as heat.
    Short,
    /// Put this voltage on the q axis, at the rotor's angle.
    Volts(Volts),
    /// Hold a field at a fixed electrical angle (a `u16` turn fraction),
    /// whatever the rotor does: only boot alignment uses this, to find the magnet.
    Field { volts: Volts, electrical: u16 },
}

pub struct Output {
    back_emf: Ratio,
    /// The share of it the drive adds back.
    emf_cancel: Ratio,
    dead_time: Volts,
    limit: Volts,
    /// How far through the next short we are, for braking softer than a short.
    shorted: Ratio,
}

impl Output {
    pub fn new(tuning: &Tuning) -> Self {
        Self {
            back_emf: from_q16(tuning.back_emf_q16),
            emf_cancel: from_q16(tuning.emf_cancel_q16),
            dead_time: from_q16(tuning.dead_time_q16),
            limit: tuning.voltage_limit(),
            shorted: Ratio::ZERO,
        }
    }

    /// Shape a push (in volts) for the knob moving as `motion` says.
    pub fn shape(&mut self, push: Volts, motion: &Motion) -> Drive {
        if push == 0 {
            self.shorted = Ratio::ZERO;
            return Drive::Off;
        }
        let emf = self.back_emf * motion.velocity;
        let volts = (push + self.emf_cancel * emf).clamp(-self.limit, self.limit);
        if let Some(drive) = self.generating(volts, emf) {
            return drive;
        }
        Drive::Volts((volts + self.dead_time_for(volts, emf)).clamp(-self.limit, self.limit))
    }

    /// The supply comes from USB through a diode and can't take energy back.
    /// A voltage between zero and the back-EMF, the same way round, would make
    /// the motor a generator charging it. For braking softer than a short,
    /// alternate short and off tick by tick to brake the same on average.
    fn generating(&mut self, volts: Volts, emf: Volts) -> Option<Drive> {
        let same_way = (volts > 0) == (emf > 0);
        if volts == 0 || !same_way || volts.abs() >= emf.abs() {
            return None;
        }
        // A short gives −emf of push; off gives none; we want volts − emf.
        self.shorted += Ratio::ONE - divide(volts.abs(), emf.abs());
        if self.shorted >= 1 {
            self.shorted -= Ratio::ONE;
            return Some(Drive::Short);
        }
        Some(Drive::Off)
    }

    /// Dead time loses a fixed voltage against the current, so add it back
    /// along the current. Current follows `volts − emf`; since volts is never
    /// between zero and emf here, this only ever adds voltage away from the
    /// generating band.
    fn dead_time_for(&self, volts: Volts, emf: Volts) -> Volts {
        let direction = ((volts - emf) * PER_DEAD_TIME_RAMP).clamp(-Ratio::ONE, Ratio::ONE);
        self.dead_time * direction
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::tuning::Tuning;
    use crate::units::TurnsPerSec;

    fn moving(velocity: f64) -> Motion {
        Motion { velocity: TurnsPerSec::from_num(velocity), ..Motion::default() }
    }

    /// The push actually delivered, as a multiple of volts − emf, averaged.
    fn average_push(push: f64, velocity: f64) -> f64 {
        let tuning = Tuning::DEFAULT;
        let mut output = Output::new(&tuning);
        let emf = from_q16(tuning.back_emf_q16).to_num::<f64>() * velocity;
        let ticks = 1_000;
        (0..ticks).map(|_| match output.shape(Volts::from_num(push), &moving(velocity)) {
            Drive::Off => 0.0,
            Drive::Short => -emf,
            Drive::Volts(v) => v.to_num::<f64>() - emf,
            Drive::Field { .. } => unreachable!("shape never holds a field"),
        }).sum::<f64>() / ticks as f64
    }

    #[test]
    fn nothing_asked_is_motor_off() {
        let mut output = Output::new(&Tuning::DEFAULT);
        assert_eq!(output.shape(Volts::ZERO, &moving(10.0)), Drive::Off);
    }

    #[test]
    fn never_commands_a_generating_voltage() {
        let tuning = Tuning::DEFAULT;
        let mut output = Output::new(&tuning);
        let back_emf = from_q16(tuning.back_emf_q16);
        for velocity in [-15.0, -3.0, -0.2, 0.0, 0.2, 3.0, 15.0] {
            let motion = moving(velocity);
            let emf = back_emf * motion.velocity;
            for push in -30..=30 {
                if let Drive::Volts(volts) = output.shape(Volts::from_num(push) / 10, &motion) {
                    let generating = volts != 0 && (volts > 0) == (emf > 0) && volts.abs() < emf.abs();
                    assert!(!generating, "{velocity} turns/s, push {push}: {volts} against {emf}");
                    assert!(volts.abs() <= tuning.voltage_limit());
                }
            }
        }
    }

    #[test]
    fn soft_braking_averages_to_the_asked_push() {
        // At 10 turns/s the emf is 1.61 V; asking −0.5 V is softer than a short.
        let delivered = average_push(-0.5, 10.0);
        // The emf the drive doesn't add back brakes on top.
        let left = 1.0 - from_q16(Tuning::DEFAULT.emf_cancel_q16).to_num::<f64>();
        assert!((delivered - (-0.5 - left * 1.61)).abs() < 0.02, "{delivered}");
    }

    #[test]
    fn pushing_adds_back_emf_and_dead_time() {
        let mut output = Output::new(&Tuning::DEFAULT);
        let Drive::Volts(volts) = output.shape(Volts::from_num(0.5), &moving(2.0)) else { panic!() };
        // 0.5 + emf_cancel · 0.322 + 0.05 of dead time.
        let cancel = from_q16(Tuning::DEFAULT.emf_cancel_q16).to_num::<f64>();
        assert!((volts.to_num::<f64>() - (0.55 + cancel * 0.322)).abs() < 0.005, "{volts}");
    }
}
