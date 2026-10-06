//! Open-loop pushes added after the physics, like a rumble. They move the
//! knob without the flywheel ever feeling them, so a rumble never changes how
//! a game's curves behave.
//!
//! TEMPORARY: a sine excitation for measuring the knob's response.

use crate::Tuning;
use crate::units::{CONTROL_HZ, Ratio, Volts, from_q16};
use serde::{Deserialize, Serialize};

/// The most pulses in one rumble.
pub const MAX_PULSES: usize = 16;
/// The longest delay or pulse, ms.
const MAX_PULSE_MS: u16 = 5_000;
/// Ticks per ms.
const PER_MS: u32 = (CONTROL_HZ / 1_000) as u32;

/// One buzz of a rumble, after a pause.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Pulse {
    pub delay_ms: u16,
    pub duration_ms: u16,
    /// A fraction of 65536 of the tuning's `rumble` volts.
    pub intensity: u16,
}

impl Pulse {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.delay_ms > MAX_PULSE_MS || self.duration_ms > MAX_PULSE_MS {
            return Err("a rumble's delays and pulses are at most 5000 ms");
        }
        Ok(())
    }
}

/// A rumble in progress, as ticks from its start.
#[derive(Default)]
struct Rumble {
    /// Each pulse's (start, end, volts).
    pulses: heapless::Vec<(u32, u32, Volts), MAX_PULSES>,
    elapsed: u32,
    /// The pulse playing or next.
    next: usize,
}

#[derive(Default)]
pub struct Effects {
    volts: Volts,
    phase: u32,
    step: u32,
    /// Drive the sine (plus any push) straight to the motor, skipping the
    /// output shaping: for measuring the bare motor.
    pub raw: bool,
    /// With `raw`: drive the d axis (current, but no torque) instead of q.
    pub d_axis: bool,
    rumble: Rumble,
    /// Volts at intensity 1, and the buzz's phase step per tick.
    rumble_volts: Volts,
    rumble_step: u32,
    rumble_phase: u32,
}

/// A sine's phase step per tick, for `hz`.
fn step(hz: u32) -> u32 {
    ((u64::from(hz) << 32) / CONTROL_HZ as u64) as u32
}

/// `volts` times the sine at `phase`.
fn sine(volts: Volts, phase: u32) -> Volts {
    let (_, sin) = idsp::cossin(phase as i32);
    Volts::from_bits((volts.to_bits() >> 16) * (i64::from(sin) >> 15))
}

impl Effects {
    pub fn new(tuning: &Tuning) -> Self {
        Self {
            rumble_volts: from_q16(tuning.rumble_q16),
            rumble_step: step((tuning.rumble_hz_q16 >> 16).max(0) as u32),
            ..Self::default()
        }
    }

    /// Play a sine of `volts` amplitude at `hz`; 0 V stops it.
    pub fn excite(&mut self, volts: Volts, hz: u32, raw: bool, d_axis: bool) {
        self.d_axis = d_axis;
        self.volts = volts;
        self.step = step(hz);
        self.phase = 0;
        self.raw = raw && volts != 0;
    }

    /// Play these pulses, one after another, instead of any rumble playing.
    pub fn rumble(&mut self, pulses: &[Pulse]) {
        let mut rumble = Rumble::default();
        let mut at = 0;
        for pulse in pulses {
            let start = at + u32::from(pulse.delay_ms) * PER_MS;
            at = start + u32::from(pulse.duration_ms) * PER_MS;
            let volts = self.rumble_volts * Ratio::from_bits(i64::from(pulse.intensity) << 16);
            let _ = rumble.pulses.push((start, at, volts));
        }
        self.rumble = rumble;
        self.rumble_phase = 0;
    }

    /// Stop any rumble.
    pub fn quiet(&mut self) {
        self.rumble = Rumble::default();
    }

    /// This tick's push.
    pub fn next(&mut self) -> Volts {
        let mut push = Volts::ZERO;
        if self.volts != 0 {
            self.phase = self.phase.wrapping_add(self.step);
            push += sine(self.volts, self.phase);
        }
        let rumble = &mut self.rumble;
        while let Some(&(_, end, _)) = rumble.pulses.get(rumble.next) {
            if rumble.elapsed < end { break; }
            rumble.next += 1;
        }
        if let Some(&(start, _, volts)) = rumble.pulses.get(rumble.next) {
            if rumble.elapsed >= start {
                self.rumble_phase = self.rumble_phase.wrapping_add(self.rumble_step);
                push += sine(volts, self.rumble_phase);
            }
            rumble.elapsed += 1;
        }
        push
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_rumble_plays_its_pulses_then_stops() {
        let mut effects = Effects::new(&Tuning::DEFAULT);
        effects.rumble(&[Pulse { delay_ms: 0, duration_ms: 10, intensity: 65_535 }, Pulse { delay_ms: 20, duration_ms: 5, intensity: 32_768 }]);
        let pushes: std::vec::Vec<Volts> = (0..2_000).map(|_| effects.next()).collect();
        let loudest = |ticks: core::ops::Range<usize>| pushes[ticks].iter().map(|push| push.abs()).max().unwrap();
        let full = Volts::from_bits(Tuning::DEFAULT.rumble_q16 as i64 * 65_536);
        assert!(loudest(0..200) > full * 9 / 10);
        assert_eq!(loudest(200..600), Volts::ZERO);
        assert!(loudest(600..700) > full * 4 / 10 && loudest(600..700) <= full / 2);
        assert_eq!(loudest(700..2_000), Volts::ZERO);
    }

    #[test]
    fn quiet_stops_a_rumble() {
        let mut effects = Effects::new(&Tuning::DEFAULT);
        effects.rumble(&[Pulse { delay_ms: 0, duration_ms: 1_000, intensity: 65_535 }]);
        effects.next();
        effects.quiet();
        assert!((0..100).all(|_| effects.next() == Volts::ZERO));
    }
}
