//! The knob's state, and what it does when something happens.

use esp_hal::{gpio::{self, Input}, peripherals::TIMG1, time::Instant, timer::timg::Wdt};
use rcade_haptics_core::{
    Command, Feel, Feelings, Tuning,
    alignment::{Aligner, Commutation},
    effects::Effects,
    flywheel::{Flywheel, Physics},
    motion::{Motion, Tracker},
    output::{Drive, Output},
    protocol::Id,
    safety::{Fault, Lease},
    svpwm,
    tuning::POLE_PAIRS,
    units::{CONTROL_HZ, Ratio, Turns, Volts, to_q16, to_units},
};

use crate::link::{Event, Reply, SPARE_BANKS, reply};
use crate::{capture, encoder::Encoder, motor::Motor};

/// Tick telemetry to the host: 100 per second.
const TELEMETRY_EVERY: u32 = (CONTROL_HZ / 100) as u32;
/// Encoder glitches in a row before it counts as a fault: 1 ms.
const ENCODER_GRACE: u32 = (CONTROL_HZ / 1_000) as u32;
/// One tick, in µs.
const PERIOD_US: u64 = 1_000_000 / CONTROL_HZ as u64;
/// A tick this late while driving is a fault: the motor has been pushing
/// along a stale angle for as long as the old 1 kHz loop's whole period.
/// Shorter hiccups (code fetched from flash for the first time) only count
/// as overruns in `stats`.
const STALE_US: u64 = 1_000;

/// The buzzer's tone: toggled every 4 ticks, 2.5 kHz.
const BUZZ_HALF_PERIOD: u32 = 4;

/// The hardware the knob drives.
pub struct Parts {
    pub buzzer: gpio::Output<'static>,
    pub motor: Motor,
    pub encoder: Encoder,
    /// The TMC6300's DIAG pin: high on overcurrent, overheating or undervoltage.
    pub driver_fault: Input<'static>,
    pub watchdog: Wdt<TIMG1<'static>>,
}

/// The curves in use: stock, or a baked config.
pub enum Curves {
    Stock,
    Baked(&'static mut Feelings),
}

impl Curves {
    /// What the curves say at a global angle.
    pub fn at(&self, position: Turns) -> Feel {
        match self {
            Curves::Stock => Feel::STOCK,
            Curves::Baked(feelings) => feelings.at(position),
        }
    }
}

/// Whether the knob knows where its magnet is yet.
pub enum Magnet {
    /// Boot: holding fields to find it.
    Finding(Aligner),
    Found(Commutation),
}

pub struct Knob {
    pub encoder: Encoder,
    pub motion: Tracker,
    pub magnet: Magnet,
    pub curves: Curves,
    pub flywheel: Flywheel,
    pub effects: Effects,
    pub output: Output,
    pub watchdog: Wdt<TIMG1<'static>>,
    pub clock: Clock,
    /// SVPWM's share per volt at this supply.
    per_volt: Ratio,
    buzzer: gpio::Output<'static>,
    motor: Motor,
    driver_fault: Input<'static>,
    lease: Lease,
    driving: bool,
    encoder_glitches: u32,
    last_fault: Option<Fault>,
}

impl Knob {
    /// `id` picks this knob's magnets out of tuning.toml; a knob that isn't
    /// listed finds its own.
    pub fn new(parts: Parts, id: &str) -> Self {
        let tuning = Tuning::DEFAULT;
        reply(Reply::Status("boot"));
        let magnet = match Commutation::known(id) {
            Some(commutation) => Magnet::Found(commutation),
            None => Magnet::Finding(Aligner::new(POLE_PAIRS)),
        };
        Self {
            encoder: parts.encoder,
            motion: Tracker::default(),
            magnet,
            curves: Curves::Stock,
            flywheel: Flywheel::new(Physics::new(&tuning)),
            effects: Effects::new(&tuning),
            output: Output::new(&tuning),
            watchdog: parts.watchdog,
            clock: Clock::default(),
            per_volt: svpwm::per_volt(tuning.supply()),
            buzzer: parts.buzzer,
            motor: parts.motor,
            driver_fault: parts.driver_fault,
            lease: Lease::default(),
            driving: false,
            encoder_glitches: 0,
            last_fault: None,
        }
    }

    /// Something happened: a command, or new curves.
    pub fn handle(&mut self, event: Event) {
        match event {
            Event::Command(command, id) => self.command(command, id),
            Event::Curves(tables, id) => {
                self.last_fault = None;
                self.use_curves(Curves::Baked(tables));
                reply(Reply::Ack("config", id, now_us()));
            }
        }
    }

    fn command(&mut self, command: Command, id: Id) {
        let done = |name| reply(Reply::Ack(name, id, now_us()));
        match command {
            Command::Hello => {
                let magnet = match self.magnet { Magnet::Found(commutation) => Some(commutation), Magnet::Finding(_) => None };
                reply(Reply::Hello { magnet });
            }
            Command::Lease => self.lease.renew(now_us()),
            Command::Reset => {
                self.use_curves(Curves::Stock);
                self.effects.quiet();
                done("reset");
            }
            Command::Brake => {
                self.flywheel.stop();
                done("brake");
            }
            Command::Tare { reference, global_angle } => {
                // Knob and flywheel move together, so the feel doesn't jump.
                let moved = self.motion.tare(reference, global_angle);
                self.flywheel.shift(moved);
                done("tare");
            }
            Command::Rumble { pulses } => {
                self.effects.rumble(&pulses);
                done("rumble");
            }
            Command::Stats => reply(self.clock.report()),
            // TEMPORARY: response measurement.
            Command::Excite { volts_q16, hz, raw, d_axis } => {
                self.effects.excite(rcade_haptics_core::units::from_q16(volts_q16), hz, raw, d_axis);
                done("excite");
            }
            Command::CaptureDump => reply(Reply::CaptureDump),
            // The link bakes configs itself and sends `Event::Curves`.
            Command::Config => reply(Reply::Error("config arrived unbaked", id)),
        }
    }

    fn use_curves(&mut self, curves: Curves) {
        if let Curves::Baked(old) = core::mem::replace(&mut self.curves, curves) {
            // Two banks exist and the channel holds two, so this never fails.
            let _ = SPARE_BANKS.try_send(old);
        }
    }

    /// Checks that run every tick, after the sensors are read.
    pub fn check(&mut self) {
        // The very first reading places the flywheel on the knob.
        if self.clock.ticks == 1 {
            self.flywheel.sync(&self.motion.last());
        }
        if self.driving && self.driver_fault.is_high() {
            return self.fault(Fault::Driver);
        }
        if self.driving && self.clock.gap_us > STALE_US {
            return self.fault(Fault::MissedTick);
        }
        if matches!(self.curves, Curves::Baked(_)) && !self.lease.alive(now_us()) {
            return self.fault(Fault::LeaseExpired);
        }
    }

    /// Boot: hold the aligner's field until it has found the magnet.
    pub fn align(&mut self, motion: &Motion) -> Drive {
        let Magnet::Finding(aligner) = &mut self.magnet else { return Drive::Off };
        // Beep first, so hands come off before it moves.
        let tone = aligner.beeping() && (self.clock.ticks / BUZZ_HALF_PERIOD) % 2 == 0;
        self.buzzer.set_level(tone.into());
        let (drive, result) = aligner.step(motion);
        match result {
            Some(Ok(commutation)) => {
                self.magnet = Magnet::Found(commutation);
                self.flywheel.sync(motion);
                reply(Reply::Status("aligned"));
            }
            Some(Err(error)) => reply(Reply::Status(error)),
            None => {}
        }
        drive
    }

    /// Something is wrong: gates off, back to stock, and say why once.
    fn fault(&mut self, fault: Fault) {
        self.motor.disable();
        self.driving = false;
        self.use_curves(Curves::Stock);
        self.effects.quiet();
        if self.last_fault != Some(fault) {
            reply(Reply::Status(fault.name()));
            self.last_fault = Some(fault);
        }
    }

    /// The encoder couldn't be read this tick: drive nothing until it can.
    pub fn glitch(&mut self, fault: Fault) {
        self.motor.disable();
        self.driving = false;
        self.clock.encoder_errors += 1;
        self.encoder_glitches += 1;
        if let Magnet::Finding(aligner) = &mut self.magnet {
            aligner.restart();
        }
        if self.encoder_glitches > ENCODER_GRACE {
            self.fault(fault);
        }
    }

    /// Do what was decided.
    pub fn act(&mut self, drive: Drive, motion: &Motion) {
        self.encoder_glitches = 0;
        self.driving = drive != Drive::Off;
        let per_volt = self.per_volt;
        match &self.magnet {
            Magnet::Found(commutation) => {
                let electrical = commutation.electrical(motion.angle);
                self.motor.drive(drive, electrical, |push| commutation.forward(push), per_volt);
            }
            // Only the aligner's fixed fields make sense before the magnet is found.
            Magnet::Finding(_) if matches!(drive, Drive::Field { .. }) => self.motor.drive(drive, 0, |push| push, per_volt),
            Magnet::Finding(_) => self.motor.disable(),
        }
    }

    /// Record what happened, and send tick telemetry now and then.
    pub fn report(&mut self, motion: &Motion, drive: Drive) {
        let tick = self.clock.ticks;
        if tick % capture::CAPTURE_EVERY == 0 {
            let millivolts = |volts: Volts| to_q16(volts * 1000).saturating_div(65_536).clamp(-32_000, 32_000) as i16;
            let stretch = (self.flywheel.position() - motion.position).to_bits() >> 16;
            capture::record(capture::Sample {
                time_us: now_us() as u32,
                angle: motion.angle,
                drive_mv: match drive {
                    Drive::Off => capture::OFF,
                    Drive::Short => capture::SHORTED,
                    Drive::Volts(volts) | Drive::Field { volts, .. } => millivolts(volts),
                },
                stretch: stretch.clamp(i16::MIN.into(), i16::MAX.into()) as i16,
            });
        }
        if tick % TELEMETRY_EVERY == 0 {
            reply(Reply::Tick {
                angle: motion.angle,
                global_angle: motion.global_angle,
                curve_angle: to_units(self.flywheel.position()),
                velocity_q16: to_q16(self.flywheel.velocity()),
                time_us: now_us(),
            });
        }
    }
}

fn now_us() -> u64 {
    Instant::now().duration_since_epoch().as_micros()
}

/// How the control loop is keeping up.
#[derive(Default)]
pub struct Clock {
    started_us: u64,
    ticks: u32,
    worst_tick_us: u32,
    overruns: u32,
    encoder_errors: u32,
    /// Time since the previous tick started, µs.
    gap_us: u64,
    /// When the current phase started, and the slowest of each phase.
    lap_us: u64,
    phases_us: [u32; 4],
}

impl Clock {
    pub fn start(&mut self) {
        let now = now_us();
        self.gap_us = if self.ticks > 0 { now - self.started_us } else { 0 };
        // More than half a period late.
        self.overruns += u32::from(self.gap_us > PERIOD_US * 3 / 2);
        self.started_us = now;
        self.lap_us = now;
        self.ticks = self.ticks.wrapping_add(1);
    }

    /// The end of a phase of the tick: 0 sense, 1 listen, 2 think, 3 act.
    pub fn lap(&mut self, phase: usize) {
        let now = now_us();
        self.phases_us[phase] = self.phases_us[phase].max((now - self.lap_us) as u32);
        self.lap_us = now;
    }

    pub fn stop(&mut self) {
        let took = (now_us() - self.started_us) as u32;
        self.worst_tick_us = self.worst_tick_us.max(took);
    }

    /// The counts since the last report.
    fn report(&mut self) -> Reply {
        let reply = Reply::Stats {
            ticks: self.ticks,
            worst_tick_us: self.worst_tick_us,
            overruns: self.overruns,
            encoder_errors: self.encoder_errors,
            phases_us: self.phases_us,
        };
        self.phases_us = [0; 4];
        self.worst_tick_us = 0;
        self.overruns = 0;
        self.encoder_errors = 0;
        reply
    }
}
