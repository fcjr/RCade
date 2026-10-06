//! What the real knob is doing: where it is, and how fast it turns.

use crate::units::{CONTROL_HZ, Turns, TurnsPerSec, from_units};
use dsp_process::{Process, SplitProcess};
use idsp::{Lowpass, LowpassState, Unwrapper};

/// Velocity for the physics. The encoder moves in steps of 1/16384 turn, so
/// one step in one tick reads as 1.2 turns/s: the raw difference is a train of
/// spikes, one per step. A second-order filter (Butterworth, 40 dB/decade)
/// smooths those into a steady speed instead of a kick per step. Its corner is
/// a balance: lower leaves more delay in the coupling's damping, which then
/// buzzes near 120 Hz under mass or friction; higher passes more of the steps.
/// 600 Hz halved the buzz of 300 Hz, and 1000 Hz was no better (measured
/// 2026-10-05): the delay left is the motor's own.
pub const FAST_HZ: i64 = 600;
/// Velocity for decisions that must not chatter, like when a brake is done.
pub const SLOW_HZ: i64 = 30;

/// idsp's corner gain: π·2³¹·f₀/f_nyquist. 355/113 is π to seven digits.
const fn corner(hz: i64) -> i64 {
    (355 << 31) * hz / 113 / (CONTROL_HZ / 2)
}

/// A first-order lowpass in idsp's units.
const fn lowpass(hz: i64) -> Lowpass<1> {
    Lowpass([corner(hz) as i32])
}

/// A second-order Butterworth lowpass in idsp's units: [k²/2³², −k·√2].
const fn butterworth(hz: i64) -> Lowpass<2> {
    let k = corner(hz);
    // 181/128 is √2 to four digits.
    Lowpass([(k * k >> 32) as i32, (-k * 181 / 128) as i32])
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Motion {
    /// The encoder angle within one turn, in 1/65536 turn. Tare doesn't move it.
    pub angle: u16,
    /// Where the knob is, in 1/65536 turn, counting whole turns: at boot it
    /// equals `angle`, and a tare sets it.
    pub global_angle: i64,
    /// `global_angle` in turns, for the physics.
    pub position: Turns,
    pub velocity: TurnsPerSec,
    pub slow_velocity: TurnsPerSec,
}

#[derive(Default)]
pub struct Tracker {
    /// Every encoder step since boot, starting from the first reading.
    unwrap: Unwrapper<i64>,
    started: bool,
    /// Added by tares.
    offset: i64,
    fast: LowpassState<2>,
    slow: LowpassState<1>,
    last: Motion,
}

impl Tracker {
    pub fn update(&mut self, angle: u16) -> Motion {
        if !self.started {
            self.unwrap.y = angle.into();
            self.started = true;
        }
        let delta = i32::from(self.unwrap.process(angle as i16));
        // Movement per tick with 16 more fractional bits is turns per tick
        // with 32; times the tick rate, turns per second.
        let per_tick = delta << 16;
        let speed = |filtered: i32| TurnsPerSec::from_bits(i64::from(filtered) * CONTROL_HZ);
        let global_angle = self.unwrap.y + self.offset;
        self.last = Motion {
            angle,
            global_angle,
            position: from_units(global_angle),
            velocity: speed(const { butterworth(FAST_HZ) }.process(&mut self.fast, per_tick)),
            slow_velocity: speed(const { lowpass(SLOW_HZ) }.process(&mut self.slow, per_tick)),
        };
        self.last
    }

    /// Where the knob was at global angle `reference` now counts as
    /// `global_angle`: any turning since the host read `reference` is kept.
    /// Without a reference, where the knob is now. Returns how far that moved
    /// the global angle, so the flywheel can move with it.
    pub fn tare(&mut self, reference: Option<i64>, global_angle: i64) -> Turns {
        let moved = global_angle - reference.unwrap_or(self.last.global_angle);
        self.offset += moved;
        self.last.global_angle += moved;
        self.last.position = from_units(self.last.global_angle);
        from_units(moved)
    }

    pub fn last(&self) -> Motion {
        self.last
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_global_angle_counts_turns_across_the_seam() {
        let mut tracker = Tracker::default();
        tracker.update(65_000);
        assert_eq!(tracker.update(500).global_angle, 65_000 + 1_036);
        let mut backwards = Tracker::default();
        backwards.update(0);
        assert_eq!(backwards.update(65_000).global_angle, -536);
    }

    #[test]
    fn many_turns_keep_counting() {
        let mut tracker = Tracker::default();
        let mut angle = 0u16;
        for _ in 0..200_000 {
            angle = angle.wrapping_add(20_000);
            tracker.update(angle);
        }
        assert_eq!(tracker.last().global_angle, 200_000 * 20_000);
    }

    #[test]
    fn tare_moves_the_global_angle_only() {
        let mut tracker = Tracker::default();
        tracker.update(1_000);
        tracker.update(3_000);
        assert_eq!(tracker.tare(None, 0), from_units(-3_000));
        let motion = tracker.update(3_100);
        assert_eq!((motion.angle, motion.global_angle), (3_100, 100));
        tracker.tare(None, -5 * 65_536);
        assert_eq!(tracker.update(3_000).global_angle, -5 * 65_536 - 100);
    }

    #[test]
    fn tare_keeps_turning_since_the_reference() {
        let mut tracker = Tracker::default();
        tracker.update(1_000);
        // The host read 1000 and sent the tare; meanwhile the knob moved on.
        tracker.update(1_400);
        tracker.tare(Some(1_000), 0);
        assert_eq!(tracker.last().global_angle, 400);
        assert_eq!(tracker.update(1_500).global_angle, 500);
    }

    #[test]
    fn a_steady_spin_reads_its_speed() {
        // Two turns per second: 65536 · 2 / 20000 ≈ 6.55 units per tick.
        let mut tracker = Tracker::default();
        let mut motion = Motion::default();
        for tick in 0..20_000u32 {
            motion = tracker.update((tick * 131_072 / CONTROL_HZ as u32) as u16);
        }
        for velocity in [motion.velocity, motion.slow_velocity] {
            assert!((velocity - TurnsPerSec::from_num(2)).abs() < TurnsPerSec::from_num(0.01), "{velocity}");
        }
    }
}
