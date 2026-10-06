//! Messages over USB serial: one JSON object per line, integers only.
//!
//! Every command arrives on the same inbox in the order it was sent. The
//! cabinet's bridge decides who may send what: games send `hello`, `config`,
//! `tare`, `reset`, `brake` and `rumble`; the cabinet also sends `lease`.
//! `stats`, `capture_dump` and the DEV ONLY tuning commands are for
//! development.
//!
//! A command may carry an `id`; its `ack` or `error` echoes it back.

use crate::{Config, alignment::Commutation, effects::{MAX_PULSES, Pulse}};
use alloc::vec::Vec as HeapVec;
use heapless::Vec;
use serde::{Deserialize, Serialize};

/// Fits a config of `MAX_POINTS` Bézier points on every curve at the widest
/// coordinates.
pub const MAX_LINE: usize = 65_536;

/// Commands stay small: a config is parsed straight into the caller's slot,
/// not carried in the command, so no big value is ever copied around.
#[derive(Debug)]
pub enum Command {
    Hello,
    /// New curves, parsed into the caller's config slot: baked off the loop,
    /// then swapped in.
    Config,
    /// The cabinet is still there. Without it the knob returns to stock.
    Lease,
    /// Back to the stock curves, and no rumble.
    Reset,
    /// Stop the knob spinning. An event, not a mode: the curves stay.
    Brake,
    /// Where the knob was at global angle `reference` now counts as
    /// `global_angle`, so turning since the host read `reference` is kept.
    /// Without a reference: where the knob is now.
    Tare { reference: Option<i64>, global_angle: i64 },
    /// Buzz the knob: these pulses, one after another.
    Rumble { pulses: Vec<Pulse, MAX_PULSES> },
    /// TEMPORARY: play a sine for measuring the knob's response.
    Excite { volts_q16: i32, hz: u32, raw: bool, d_axis: bool },
    /// How the control loop is keeping up.
    Stats,
    /// The raw angle history, for measuring the knob.
    CaptureDump,
}

/// A command, and the `id` its reply echoes.
pub type Id = Option<u32>;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Message<'a> {
    /// `magnet`: how the knob found its magnet at boot; absent until then,
    /// and until then it can't push.
    Hello { device: &'a str, id: &'a str, magnet: Option<Commutation>, max_points: usize },
    /// In 1/65536 turn: `angle` is the encoder, `global_angle` the knob since
    /// boot or a tare, `curve_angle` the flywheel, where the curves are read.
    /// `velocity_q16` is the flywheel's, turns/s.
    Tick { angle: u16, global_angle: i64, curve_angle: i64, velocity_q16: i32, time_us: u64 },
    Status { reason: &'a str },
    Ack {
        command: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Id,
        time_us: u64,
    },
    Error {
        message: &'a str,
        #[serde(skip_serializing_if = "Option::is_none")]
        id: Id,
    },
    /// Control loop timing since the last `stats`, in µs.
    /// `phases_us`: the slowest sense, listen, think and act phases.
    Stats { ticks: u32, worst_tick_us: u32, overruns: u32, encoder_errors: u32, phases_us: [u32; 4] },
    /// `capture_dump` reply: `count` samples follow in `capture_chunk` lines.
    Capture { count: usize },
    /// Raw samples, oldest first: low 32 bits of the µs clock, encoder
    /// angle, the drive in mV (−32768 off, −32767 shorted), and how far the
    /// flywheel is from the knob in 1/65536 turn (saturating).
    CaptureChunk { time_us: &'a [u32], angle: &'a [u16], drive_mv: &'a [i16], stretch: &'a [i16] },
    CaptureEnd,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
enum Kind { Hello, Config, Lease, Reset, Brake, Tare, Rumble, Stats, CaptureDump, Excite }

// An explicitly typed envelope avoids Serde's allocating internally-tagged
// deserializer. The protocol task uses bounded storage and no general JSON tree.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    #[serde(rename = "type")]
    kind: Kind,
    id: Option<u32>,
    config: Option<Config>,
    global_angle: Option<i64>,
    reference: Option<i64>,
    pulses: Option<HeapVec<Pulse>>,
    volts_q16: Option<i32>,
    hz: Option<u32>,
    raw: Option<bool>,
    d_axis: Option<bool>,
}

/// Parse one line. A `config` is written into `slot`. Kept out of line so its
/// large temporaries only take stack space while a line is being parsed.
/// The id comes back even with an error, if the line had one.
#[inline(never)]
pub fn parse(line: &[u8], slot: &mut Config) -> (Id, Result<Command, &'static str>) {
    // serde_json also rejects anything after the object.
    let Ok(wire) = serde_json::from_slice::<Envelope>(line) else { return (None, Err("invalid JSON command")) };
    let id = wire.id;
    (id, command(wire, slot))
}

fn command(wire: Envelope, slot: &mut Config) -> Result<Command, &'static str> {
    let Envelope { kind, id: _, config, global_angle, reference, pulses, volts_q16, hz, raw, d_axis } = wire;
    let unexpected = Err("unexpected command fields");
    let excite = volts_q16.is_some() || hz.is_some() || raw.is_some() || d_axis.is_some();
    let rest = config.is_some() || global_angle.is_some() || reference.is_some() || pulses.is_some();
    match kind {
        Kind::Excite => match (volts_q16, hz, rest) {
            (Some(volts_q16), Some(hz), false) => Ok(Command::Excite { volts_q16, hz, raw: raw.unwrap_or(false), d_axis: d_axis.unwrap_or(false) }),
            _ => Err("excite needs volts_q16 and hz"),
        },
        _ if excite => unexpected,
        Kind::Tare if config.is_none() && pulses.is_none() =>
            Ok(Command::Tare { reference, global_angle: global_angle.unwrap_or(0) }),
        Kind::Rumble => match (pulses, config.is_none() && global_angle.is_none() && reference.is_none()) {
            (Some(pulses), true) => {
                let pulses = Vec::from_slice(&pulses).map_err(|_| "a rumble has at most 16 pulses")?;
                pulses.iter().try_for_each(Pulse::validate)?;
                Ok(Command::Rumble { pulses })
            }
            _ => Err("rumble needs pulses"),
        },
        Kind::Config => match (config, global_angle.is_none() && reference.is_none() && pulses.is_none()) {
            (Some(config), true) => {
                *slot = config;
                Ok(Command::Config)
            }
            _ => unexpected,
        },
        _ if rest => unexpected,
        Kind::Hello => Ok(Command::Hello),
        Kind::Lease => Ok(Command::Lease),
        Kind::Reset => Ok(Command::Reset),
        Kind::Brake => Ok(Command::Brake),
        Kind::Stats => Ok(Command::Stats),
        Kind::CaptureDump => Ok(Command::CaptureDump),
        Kind::Tare => unexpected,
    }
}

/// A bounded line framer. Once full, discard the whole line, not just its prefix.
pub struct Lines {
    bytes: Vec<u8, MAX_LINE>,
    discarding: bool,
}

impl Default for Lines {
    fn default() -> Self {
        Self::new()
    }
}

impl Lines {
    pub const fn new() -> Self {
        Self { bytes: Vec::new(), discarding: false }
    }

    /// Take one byte; at the end of a line, parse it (a config into `slot`).
    pub fn push(&mut self, byte: u8, slot: &mut Config) -> Option<(Id, Result<Command, &'static str>)> {
        if byte == b'\n' {
            let result = if self.discarding { (None, Err("JSON line is too long")) }
                         else { parse(&self.bytes, slot) };
            self.bytes.clear();
            self.discarding = false;
            return Some(result);
        }
        if !self.discarding && self.bytes.push(byte).is_err() {
            self.bytes.clear();
            self.discarding = true;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(line: &[u8]) -> Result<Command, &'static str> {
        super::parse(line, &mut Config::stock()).1
    }

    #[test]
    fn frames_fragmented_and_consecutive_commands() {
        let mut lines = Lines::default();
        let mut count = 0;
        for byte in b"{\"type\":\"lease\"}\r\n{\"type\":\"brake\"}\n" {
            if let Some((_, command)) = lines.push(*byte, &mut Config::stock()) {
                assert!(command.is_ok());
                count += 1;
            }
        }
        assert_eq!(count, 2);
    }

    #[test]
    fn overflow_is_discarded_until_newline_and_recovers() {
        let mut lines = Lines::default();
        for _ in 0..MAX_LINE + 100 { assert!(lines.push(b'x', &mut Config::stock()).is_none()); }
        assert!(lines.push(b'\n', &mut Config::stock()).unwrap().1.is_err());
        for byte in b"{\"type\":\"hello\"}" { lines.push(*byte, &mut Config::stock()); }
        assert!(matches!(lines.push(b'\n', &mut Config::stock()), Some((None, Ok(Command::Hello)))));
    }

    #[test]
    fn rejects_unknown_commands_fields_and_trailing_objects() {
        assert!(parse(br#"{"type":"disable_safety"}"#).is_err());
        assert!(parse(br#"{"type":"reset","ignore_fault":true}"#).is_err());
        assert!(parse(br#"{"type":"hello"}{}"#).is_err());
        assert!(parse(br#"{"type":"kick","volts_q16":1,"duration_ms":150}"#).is_err());
        assert!(matches!(parse(br#"{"type":"stats"}"#), Ok(Command::Stats)));
        assert!(parse(br#"{"type":"tuning_get"}"#).is_err());
        assert!(matches!(parse(br#"{"type":"tare"}"#), Ok(Command::Tare { reference: None, global_angle: 0 })));
        assert!(matches!(parse(br#"{"type":"tare","global_angle":-9000000000}"#), Ok(Command::Tare { global_angle: -9_000_000_000, .. })));
        assert!(matches!(parse(br#"{"type":"tare","reference":5,"global_angle":7}"#), Ok(Command::Tare { reference: Some(5), global_angle: 7 })));
        assert!(parse(br#"{"type":"brake","global_angle":5}"#).is_err());
        assert!(parse(br#"{"type":"brake","pulses":[]}"#).is_err());
    }

    #[test]
    fn ids_come_back_even_with_errors() {
        let mut slot = Config::stock();
        assert!(matches!(super::parse(br#"{"type":"brake","id":7}"#, &mut slot), (Some(7), Ok(Command::Brake))));
        assert!(matches!(super::parse(br#"{"type":"rumble","id":8}"#, &mut slot), (Some(8), Err(_))));
        assert!(matches!(super::parse(br#"{"type":"rumble","id":8"#, &mut slot), (None, Err(_))));
    }

    #[test]
    fn rumbles_are_checked() {
        let Ok(Command::Rumble { pulses }) = parse(br#"{"type":"rumble","pulses":[{"delay_ms":0,"duration_ms":30,"intensity":65535}]}"#)
            else { panic!("expected a rumble") };
        assert_eq!(pulses.len(), 1);
        assert!(parse(br#"{"type":"rumble"}"#).is_err());
        assert!(parse(br#"{"type":"rumble","pulses":[{"delay_ms":0,"duration_ms":60000,"intensity":1}]}"#).is_err());
        let many = std::format!(r#"{{"type":"rumble","pulses":[{}]}}"#,
            std::vec![r#"{"delay_ms":0,"duration_ms":1,"intensity":1}"#; 17].join(","));
        assert!(parse(many.as_bytes()).is_err());
    }

    #[test]
    fn configs_round_trip() {
        let bytes = serde_json::to_vec(&serde_json::json!({"type": "config", "config": Config::stock()})).unwrap();
        let mut slot = Config::stock();
        slot.mass = crate::curves::Setting::Uniform(1);
        assert!(matches!(super::parse(&bytes, &mut slot), (None, Ok(Command::Config))));
        assert_eq!(slot, Config::stock());
    }

    #[test]
    fn a_full_config_fits_in_a_line() {
        let mut config = Config::stock();
        let far = -crate::curves::MAX_COORDINATE;
        let full = |value| crate::Curve { flat_before: true, flat_after: true, points: (0..crate::curves::MAX_POINTS as i64)
            .map(|i| crate::Point { x: far + i, y: value, incoming: Some(value), outgoing: Some(value) }).collect() };
        let full = |value| crate::curves::Setting::Curve(full(value));
        config.target = full(far);
        config.mass = full(65_535);
        config.tension = full(65_535);
        config.friction = full(65_535);
        let line = serde_json::to_vec(&serde_json::json!({"type": "config", "id": u32::MAX, "config": config})).unwrap();
        assert!(line.len() < MAX_LINE, "{} bytes", line.len());
        assert!(parse(&line).is_ok());
    }
}
