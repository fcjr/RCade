//! The virtual flywheel: the knob you feel is a pretend wheel, not the real one.
//!
//! The curves act on the flywheel: its mass, a spring toward the target, and
//! damping. A stiff, damped coupling ties the flywheel to the real knob, and
//! the coupling's pull is what the motor pushes with. Nothing here uses the
//! real knob's acceleration, which is far too noisy to feel through.
//!
//! Each tick solves the flywheel's next speed implicitly (backward Euler),
//! which stays stable for any mass: none at all (stock), or a wall.

use crate::curves::{Feel, STOCK_FRICTION};
use crate::motion::Motion;
use crate::tuning::Tuning;
use crate::units::{CONTROL_HZ, Ratio, Turns, TurnsPerSec, Volts, divide, from_q16};

/// One tick, in seconds.
const DT: Ratio = Ratio::from_bits((1 << 32) / CONTROL_HZ);
/// The drag model is measured from 1.6 turns/s up. Below that the real drag is
/// smaller than modelled (friction, and the driver's dead-time loss at small
/// currents), so a full cancel there would push the knob more than its drag
/// and keep it rocking. The cancel fades in with speed instead, reaching full
/// at 1 turn/s: a crawling knob always keeps slowing, and it fades
/// through zero, so there's no edge for noise to flip it across.
/// 1 / that 1 turn/s: the tick multiplies. Full at 2 turns/s also stops the
/// rocking, but shortens coasts (measured 2026-10-05).
const PER_CANCEL_RAMP: Ratio = Ratio::lit("1");
/// A brake gives up after this long, in case something holds the knob.
const BRAKE_TICKS: u32 = (CONTROL_HZ as u32) * 400 / 1_000;
/// Below this speed a braked knob counts as stopped.
const STOPPED: TurnsPerSec = TurnsPerSec::lit("0.02");
/// Weight is felt in ratios, so mass is exponential: the knob and flywheel
/// together are (1 + tuning's mass)^mass bare knobs. Equal steps in mass feel
/// like equal steps in weight, from the bare knob at 0 to the tuning's mass at
/// 1. Linear, mass 0.1 already added 10 bare knobs of 100, and every mass above
/// that felt about the same. The tick reads it from a table of this many steps
/// across mass 0 to 1, between them a straight line.
const MASS_STEPS: usize = 64;
/// Mass, tension and friction move to new values over 10 ms at most, instead
/// of jumping: a game sliding a value, or the toy sending ten configs a
/// second, is felt as a smooth change, not a staircase of clicks.
const FEEL_SLEW: Ratio = Ratio::from_bits((1 << 32) / (CONTROL_HZ / 100));

/// The tuning, rearranged so a tick needs one division.
pub struct Physics {
    coupling_stiffness: Ratio,
    coupling_damping: Ratio,
    /// 1 / coupling stiffness, to unwind the coupling when it slips.
    coupling_give: Ratio,
    /// The flywheel's inertia at each step of mass, divided by a tick: volts
    /// per turn/s.
    mass: [Ratio; MASS_STEPS + 1],
    tension_max: Ratio,
    friction_max: Ratio,
    drag_cancel: Ratio,
    drag_coulomb: Volts,
    drag_viscous: Ratio,
    limit: Volts,
}

impl Physics {
    pub fn new(tuning: &Tuning) -> Self {
        let accel = from_q16(tuning.accel_q16);
        let stiffness = from_q16(tuning.coupling_stiffness_q16);
        Self {
            coupling_stiffness: stiffness,
            coupling_damping: from_q16(tuning.coupling_damping_q16),
            coupling_give: Ratio::ONE / stiffness,
            // The bare knob's inertia is 1/accel volts per turn/s².
            mass: mass_table(from_q16(tuning.mass_q16), Ratio::from_num(CONTROL_HZ) / accel),
            tension_max: from_q16(tuning.tension_q16),
            friction_max: from_q16(tuning.friction_q16),
            drag_cancel: from_q16(tuning.drag_cancel_q16),
            drag_coulomb: from_q16(tuning.drag_coulomb_q16),
            // The knob's own drag, plus the back-EMF the drive leaves.
            drag_viscous: from_q16(tuning.drag_viscous_q16)
                + (Ratio::ONE - from_q16(tuning.emf_cancel_q16)) * from_q16(tuning.back_emf_q16),
            limit: tuning.voltage_limit(),
        }
    }
}

/// What the curves ask of the flywheel at one angle, in physical units.
struct Gains {
    /// Inertia over a tick, volts per turn/s.
    inertia: Ratio,
    /// Spring, volts per turn.
    tension: Ratio,
    /// Damping, volts per turn/s.
    damping: Ratio,
    /// How far toward friction 0 the curve is: 0 at stock, 1 at friction 0.
    cancel: Ratio,
}

impl Gains {
    /// Friction above its stock value adds damping; below it, cancels some
    /// of the knob's own drag. Both are nothing at stock.
    fn new(feel: Feel, physics: &Physics) -> Self {
        let friction = feel.friction - STOCK_FRICTION;
        let (damping, cancel) = if friction >= 0 {
            (physics.friction_max * friction * 2, Ratio::ZERO)
        } else {
            (Ratio::ZERO, -friction * 2)
        };
        Self { inertia: physics.inertia(feel.mass), tension: physics.tension_max * feel.tension, damping, cancel }
    }
}

impl Physics {
    /// The flywheel's inertia over a tick at this mass, from the table.
    fn inertia(&self, mass: Ratio) -> Ratio {
        let scaled = mass.clamp(Ratio::ZERO, Ratio::ONE) * MASS_STEPS as i64;
        let index = (scaled.to_bits() >> 32) as usize;
        if index >= MASS_STEPS {
            return self.mass[MASS_STEPS];
        }
        let (low, high) = (self.mass[index], self.mass[index + 1]);
        low + (high - low) * scaled.frac()
    }
}

/// The flywheel's inertia at each mass step, over a tick: (1 + most)^mass − 1
/// bare knobs, `bare` being one bare knob's. Worked out without floating
/// point: (1 + most)^(1/64) by six square roots, then its powers.
fn mass_table(most: Ratio, bare: Ratio) -> [Ratio; MASS_STEPS + 1] {
    let sqrt = |value: Ratio| Ratio::from_bits(((value.to_bits() as u128) << 32).isqrt() as i64);
    let mut step = Ratio::ONE + most;
    for _ in 0..MASS_STEPS.ilog2() {
        step = sqrt(step);
    }
    let mut table = [Ratio::ZERO; MASS_STEPS + 1];
    let mut total = Ratio::ONE;
    for entry in &mut table {
        *entry = (total - Ratio::ONE) * bare;
        total *= step;
    }
    // Exact at the top, whatever rounding gathered on the way.
    table[MASS_STEPS] = most * bare;
    table
}

pub struct Flywheel {
    physics: Physics,
    position: Turns,
    velocity: TurnsPerSec,
    /// Ticks left in a brake.
    braking: u32,
    /// Mass, tension and friction as felt now, slewing toward the curves'.
    felt: Feel,
}

impl Flywheel {
    pub fn new(physics: Physics) -> Self {
        Self { physics, position: Turns::ZERO, velocity: TurnsPerSec::ZERO, braking: 0, felt: Feel::STOCK }
    }

    /// Put the flywheel exactly where the knob is.
    pub fn sync(&mut self, knob: &Motion) {
        self.position = knob.position;
        self.velocity = knob.velocity;
    }

    /// Where the flywheel is: the global angle the curves are read at.
    pub fn position(&self) -> Turns {
        self.position
    }

    /// How fast the flywheel turns.
    pub fn velocity(&self) -> TurnsPerSec {
        self.velocity
    }

    /// Tare: the knob's global angle moved by `by`, so move with it.
    pub fn shift(&mut self, by: Turns) {
        self.position += by;
    }

    /// The brake event: stop the flywheel and hold it still until the knob
    /// stops too, so the coupling drags the knob to a halt.
    pub fn stop(&mut self) {
        self.velocity = TurnsPerSec::ZERO;
        self.braking = BRAKE_TICKS;
    }

    /// Advance one tick and return the push on the real knob, in volts.
    /// Stock curves return exactly zero.
    pub fn step(&mut self, knob: &Motion, feel: Feel) -> Volts {
        if self.braking > 0 {
            return self.brake(knob);
        }
        let feel = self.slew(feel);
        let gains = Gains::new(feel, &self.physics);
        let Physics { coupling_stiffness, coupling_damping, .. } = self.physics;

        // The spring toward the target, at the flywheel's current angle. Its
        // pull is capped at what the motor can deliver: a target many turns
        // away pulls as hard as possible, not with an impossible force.
        let limit = self.physics.limit;
        let spring = (gains.tension * feel.to_target).clamp(-limit, limit);
        // Solve for the speed that balances the flywheel's momentum, its
        // curves and the coupling at the end of the tick.
        let momentum = gains.inertia * self.velocity;
        // The coupling at the end of the tick, with the knob where it will be
        // by then: a knob and flywheel moving together stay exactly together.
        let knob_then = knob.position + knob.velocity * DT;
        let pull = coupling_stiffness * (knob_then - self.position) + coupling_damping * knob.velocity;
        let resistance = gains.inertia + (gains.tension + coupling_stiffness) * DT + gains.damping + coupling_damping;
        let velocity = divide(momentum + spring + pull, resistance);

        // What the flywheel pushes the coupling with: its curves minus what
        // it spends on its own acceleration.
        let push = spring - gains.tension * DT * velocity - gains.damping * velocity - gains.inertia * (velocity - self.velocity);
        let push = self.slip(knob, push, velocity, &gains, spring);

        push + self.cancel_drag(&gains)
    }

    /// Move the felt mass, tension and friction toward the curves' by at most
    /// `FEEL_SLEW`. The target angle passes straight through: a detent's edge
    /// must stay sharp.
    fn slew(&mut self, feel: Feel) -> Feel {
        let toward = |now: Ratio, to: Ratio| now + (to - now).clamp(-FEEL_SLEW, FEEL_SLEW);
        self.felt = Feel {
            to_target: feel.to_target,
            mass: toward(self.felt.mass, feel.mass),
            tension: toward(self.felt.tension, feel.tension),
            friction: toward(self.felt.friction, feel.friction),
        };
        self.felt
    }

    /// Move the flywheel on. When the motor can't push as hard as the
    /// coupling asks, the flywheel feels only the push the motor delivers,
    /// and the coupling stretches no further than the motor can pull: it
    /// slips instead of winding up, so letting go never snaps back.
    fn slip(&mut self, knob: &Motion, push: Volts, velocity: TurnsPerSec, gains: &Gains, spring: Volts) -> Volts {
        let limit = self.physics.limit;
        if push.abs() <= limit {
            self.velocity = velocity;
            self.position += velocity * DT;
            return push;
        }
        let push = push.clamp(-limit, limit);
        let resistance = gains.inertia + gains.tension * DT + gains.damping;
        let free = if resistance > 0 {
            divide(gains.inertia * self.velocity + spring - push, resistance)
        } else {
            knob.velocity
        };
        // Slipping never adds energy: the flywheel's speed only moves toward
        // the knob's. A heavy flywheel keeps its momentum and slows; a light
        // one rides the edge of the coupling with the knob.
        let (low, high) = if self.velocity < knob.velocity { (self.velocity, knob.velocity) } else { (knob.velocity, self.velocity) };
        self.velocity = free.clamp(low, high);
        let reach = limit * self.physics.coupling_give;
        self.position = (self.position + self.velocity * DT).clamp(knob.position - reach, knob.position + reach);
        push
    }

    /// Push along the flywheel's motion to cancel `drag_cancel` of the knob's
    /// own drag: most of it, so friction 0 coasts a long way and still stops
    /// by itself. Driven by the flywheel's smooth speed, not the knob's noisy one.
    fn cancel_drag(&self, gains: &Gains) -> Volts {
        if gains.cancel == 0 {
            return Volts::ZERO;
        }
        let fade = (self.velocity.abs() * PER_CANCEL_RAMP).min(Ratio::ONE);
        let along = if self.velocity >= 0 { Ratio::ONE } else { -Ratio::ONE };
        let Physics { drag_coulomb, drag_viscous, drag_cancel, .. } = self.physics;
        gains.cancel * drag_cancel * fade * (drag_coulomb * along + drag_viscous * self.velocity)
    }

    /// Hold the flywheel still and let the coupling drag the knob to it.
    fn brake(&mut self, knob: &Motion) -> Volts {
        self.braking -= 1;
        if knob.slow_velocity.abs() < STOPPED {
            self.braking = 0;
        }
        let Physics { coupling_stiffness, coupling_damping, coupling_give, limit, .. } = self.physics;
        let push = coupling_stiffness * (self.position - knob.position) - coupling_damping * knob.velocity;
        if push.abs() <= limit {
            return push;
        }
        let push = push.clamp(-limit, limit);
        self.position = knob.position + (push + coupling_damping * knob.velocity) * coupling_give;
        push
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curves::Feel;
    use crate::tuning::Tuning;
    use std::vec::Vec;

    /// A simulated knob: inertia, its own drag, and whatever the motor pushes.
    struct Knob {
        motion: Motion,
        accel: f64,
        coulomb: f64,
        viscous: f64,
        /// Speed, turns/s, in full precision.
        speed: f64,
        position: f64,
    }

    impl Knob {
        fn new(speed: f64) -> Self {
            let tuning = Tuning::DEFAULT;
            let f = |q: i32| from_q16(q).to_num::<f64>();
            let accel = f(tuning.accel_q16);
            // Its own drag, plus the back-EMF the output leaves uncancelled.
            let viscous = f(tuning.drag_viscous_q16) + (1.0 - f(tuning.emf_cancel_q16)) * f(tuning.back_emf_q16);
            let mut knob = Self { motion: Motion::default(), accel,
                coulomb: f(tuning.drag_coulomb_q16) * accel, viscous: viscous * accel,
                speed, position: 0.0 };
            knob.sense();
            knob
        }

        fn sense(&mut self) {
            self.motion.position = Turns::from_num(self.position);
            self.motion.velocity = TurnsPerSec::from_num(self.speed);
            self.motion.slow_velocity = self.motion.velocity;
        }

        /// One tick with `push` volts from the motor (capped at its limit, as
        /// the output stage does) and `hand` volts from a hand.
        fn tick(&mut self, push: Volts, hand: f64) {
            let dt = 1.0 / CONTROL_HZ as f64;
            let limit = Tuning::DEFAULT.voltage_limit().to_num::<f64>();
            let push = push.to_num::<f64>().clamp(-limit, limit);
            let drive = (push + hand) * self.accel - self.viscous * self.speed;
            let mut speed = self.speed + drive * dt;
            // Coulomb friction stops the knob rather than reversing it.
            let friction = self.coulomb * dt;
            speed = if speed.abs() <= friction { 0.0 } else { speed - friction * speed.signum() };
            self.speed = speed;
            self.position += speed * dt;
            self.sense();
        }
    }

    fn feel(mass: f64, tension: f64, friction: f64) -> Feel {
        Feel { to_target: Turns::ZERO, mass: Ratio::from_num(mass), tension: Ratio::from_num(tension), friction: Ratio::from_num(friction) }
    }

    fn run(knob: &mut Knob, flywheel: &mut Flywheel, feel: Feel, ticks: u32) -> Vec<f64> {
        let mut pushes = Vec::new();
        for _ in 0..ticks {
            let push = flywheel.step(&knob.motion, feel);
            pushes.push(push.to_num::<f64>());
            knob.tick(push, 0.0);
        }
        pushes
    }

    fn flywheel_at(knob: &Knob) -> Flywheel {
        let mut flywheel = Flywheel::new(Physics::new(&Tuning::DEFAULT));
        flywheel.sync(&knob.motion);
        flywheel
    }

    #[test]
    fn stock_pushes_exactly_nothing() {
        for speed in [0.0, 0.3, -2.0, 20.0] {
            let mut knob = Knob::new(speed);
            let mut flywheel = flywheel_at(&knob);
            assert!(run(&mut knob, &mut flywheel, Feel::STOCK, 4_000).iter().all(|&push| push == 0.0));
        }
    }

    #[test]
    fn the_flywheel_follows_a_stock_knob() {
        let mut knob = Knob::new(3.0);
        let mut flywheel = flywheel_at(&knob);
        for _ in 0..2_000 {
            flywheel.step(&knob.motion, Feel::STOCK);
            knob.speed = 3.0;
            knob.position += 3.0 / CONTROL_HZ as f64;
            knob.sense();
        }
        let behind = (knob.motion.position - flywheel.position).abs();
        assert!(behind < Turns::from_num(0.001), "{behind}");
    }

    #[test]
    fn mass_is_exponential_from_the_bare_knob_to_the_tuning_s_mass() {
        let physics = Physics::new(&Tuning::DEFAULT);
        let most = from_q16(Tuning::DEFAULT.mass_q16).to_num::<f64>();
        let bare = physics.inertia(Ratio::ONE).to_num::<f64>() / most;
        for mass in [0.0, 0.1, 0.25, 0.5, 0.75, 1.0] {
            // In bare knobs, added to the knob's own one.
            let added = physics.inertia(Ratio::from_num(mass)).to_num::<f64>() / bare;
            let expected = (1.0 + most).powf(mass) - 1.0;
            assert!((added - expected).abs() <= 0.01 * expected.max(1.0), "mass {mass}: {added} vs {expected}");
        }
        // Equal steps multiply the whole weight equally.
        let total = |mass: f64| 1.0 + physics.inertia(Ratio::from_num(mass)).to_num::<f64>() / bare;
        let ratios = [total(0.25) / total(0.0), total(0.5) / total(0.25), total(1.0) / total(0.75)];
        assert!(ratios.iter().all(|ratio| (ratio - ratios[0]).abs() < 0.05), "{ratios:?}");
    }

    #[test]
    fn mass_never_adds_energy() {
        for mass in [0.0, 0.25, 1.0] {
            for friction in [0.5, 1.0] {
                let mut knob = Knob::new(5.0);
                let mut flywheel = flywheel_at(&knob);
                for _ in 0..20_000 {
                    let push = flywheel.step(&knob.motion, feel(mass, 0.0, friction));
                    knob.tick(push, 0.0);
                    assert!(knob.speed.abs() <= 5.0, "mass {mass}: sped up to {}", knob.speed);
                }
            }
        }
    }

    #[test]
    fn heavy_mass_keeps_a_knob_spinning_longer() {
        let coast = |mass| {
            let mut knob = Knob::new(5.0);
            let mut flywheel = flywheel_at(&knob);
            run(&mut knob, &mut flywheel, feel(mass, 0.0, 0.5), 2_000);
            knob.speed
        };
        assert!(coast(1.0) > coast(0.0) + 0.5, "{} vs {}", coast(1.0), coast(0.0));
    }

    #[test]
    fn friction_zero_coasts_and_never_self_starts() {
        // Coasting from 3 turns/s for a tenth of a second: stock has all but
        // stopped, friction 0 keeps going much longer, more so with mass, and
        // nothing speeds up.
        let coast = |mass: f64, friction: f64| {
            let mut spinning = Knob::new(3.0);
            let mut flywheel = flywheel_at(&spinning);
            flywheel.felt = feel(mass, 0.0, friction);
            // Start from a settled coupling, as when a game changes the feel
            // of a knob already spinning, not from a flywheel synced mid-tick.
            for _ in 0..200 {
                let push = flywheel.step(&spinning.motion, feel(mass, 0.0, friction));
                spinning.tick(push, 0.0);
            }
            let start = spinning.speed;
            for _ in 0..2_000 {
                let push = flywheel.step(&spinning.motion, feel(mass, 0.0, friction));
                spinning.tick(push, 0.0);
            }
            assert!(spinning.speed <= start, "sped up by itself to {} from {start}", spinning.speed);
            spinning.speed
        };
        let (stock, free, heavy) = (coast(0.0, 0.5), coast(0.0, 0.0), coast(1.0, 0.0));
        assert!(stock < 0.5 && free > 1.0 && heavy > 2.8, "stock {stock}, friction 0 {free}, with mass {heavy}");

        let mut still = Knob::new(0.0);
        let mut flywheel = flywheel_at(&still);
        run(&mut still, &mut flywheel, feel(0.0, 0.0, 0.0), 20_000);
        assert_eq!(still.speed, 0.0);
    }

    #[test]
    fn changes_in_feel_ramp_instead_of_jumping() {
        let mut knob = Knob::new(0.0);
        knob.position = 0.05;
        knob.sense();
        let mut flywheel = flywheel_at(&knob);
        let pull = Feel { to_target: Turns::from_num(-0.05), ..feel(0.0, 1.0, 0.5) };
        let pushes: Vec<f64> = (0..400).map(|_| flywheel.step(&knob.motion, pull).to_num()).collect();
        // Full tension arrives over 10 ms (200 ticks), not in one tick.
        assert!(pushes[0].abs() < pushes[199].abs() / 50.0, "{} then {}", pushes[0], pushes[199]);
        for pair in pushes[..200].windows(2) {
            assert!((pair[1] - pair[0]).abs() < pushes[199].abs() / 50.0, "a step: {pair:?}");
        }
    }

    #[test]
    fn tension_pulls_toward_the_target_and_settles() {
        let mut knob = Knob::new(0.0);
        knob.position = 0.05;
        knob.sense();
        let mut flywheel = flywheel_at(&knob);
        for _ in 0..20_000 {
            // The target is at 0: the short way there from the flywheel.
            let feel = Feel { to_target: -flywheel.position(), ..feel(0.0, 1.0, 0.5) };
            let push = flywheel.step(&knob.motion, feel);
            knob.tick(push, 0.0);
        }
        assert!(knob.position.abs() < 0.01, "stopped at {}", knob.position);
        assert!(knob.speed.abs() < 0.05);
    }

    #[test]
    fn a_held_heavy_flywheel_slips_and_never_snaps_back() {
        let mut knob = Knob::new(0.0);
        let mut flywheel = flywheel_at(&knob);
        let heavy = feel(1.0, 0.0, 0.5);
        // Spin the flywheel up with the hand, then hold the knob still.
        for _ in 0..4_000 {
            let push = flywheel.step(&knob.motion, heavy);
            knob.tick(push, 2.0);
        }
        for _ in 0..4_000 {
            let push = flywheel.step(&knob.motion, heavy);
            assert!(push.abs() <= flywheel.physics.limit);
            knob.speed = 0.0;
            knob.sense();
        }
        // Released: the coupling holds at most the limit's worth of stretch.
        let stretch = (flywheel.position - knob.motion.position).abs();
        assert!(stretch * flywheel.physics.coupling_stiffness <= flywheel.physics.limit * 2, "{stretch}");
    }

    /// Pull the knob toward a target turns away until it spins, like a game
    /// setting a far target, then switch to `then`; return its speed after.
    fn after_a_far_pull(then: Feel, ticks: u32) -> (f64, Flywheel) {
        let mut knob = Knob::new(0.0);
        let mut flywheel = flywheel_at(&knob);
        for _ in 0..4_000 {
            let far = Feel { to_target: Turns::from_num(20) - flywheel.position(), ..feel(0.0, 0.2, 0.0) };
            let push = flywheel.step(&knob.motion, far);
            knob.tick(push, 0.0);
        }
        assert!(knob.speed > 2.0, "the pull should spin it up: {}", knob.speed);
        let start = knob.speed;
        for _ in 0..ticks {
            let push = flywheel.step(&knob.motion, then);
            knob.tick(push, 0.0);
            assert!(knob.speed <= start + 0.05, "sped up by itself to {} from {start}", knob.speed);
        }
        (knob.speed, flywheel)
    }

    #[test]
    fn a_far_target_never_winds_up_the_flywheel() {
        for then in [feel(1.0, 0.0, 0.5), feel(0.0, 0.0, 0.0), feel(1.0, 0.0, 0.0), Feel::STOCK] {
            let (_, flywheel) = after_a_far_pull(then, 20_000);
            assert!(flywheel.velocity.abs() < TurnsPerSec::from_num(30), "{then:?}: flywheel at {}", flywheel.velocity);
        }
    }

    #[test]
    fn heavy_mass_after_a_far_pull_slows_down() {
        let (speed, _) = after_a_far_pull(feel(1.0, 0.0, 0.5), 40_000);
        assert!(speed >= 0.0);
    }

    #[test]
    fn braking_stops_a_spinning_knob_on_stock_curves() {
        let mut knob = Knob::new(10.0);
        let mut flywheel = flywheel_at(&knob);
        flywheel.stop();
        run(&mut knob, &mut flywheel, Feel::STOCK, BRAKE_TICKS);
        assert!(knob.speed.abs() < 0.1, "still at {}", knob.speed);
        // Once stopped, stock is exactly zero again.
        assert!(run(&mut knob, &mut flywheel, Feel::STOCK, 100).iter().all(|&push| push == 0.0));
    }
}
