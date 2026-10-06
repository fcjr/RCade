//! Raw history, for measuring the knob (`cargo tune`).
//!
//! Every `CAPTURE_EVERY`th tick stores its timestamp, the encoder angle, what
//! the motor was told and how far the flywheel was from the knob, with no
//! filtering. `capture_dump` sends the last couple of seconds so the host can
//! see exactly what the control loop did.

use core::cell::RefCell;
use core::sync::atomic::{AtomicBool, Ordering};
use critical_section::Mutex;
use heapless::{HistoryBuffer, Vec};
use rcade_haptics_core::units::CONTROL_HZ;

/// Record at 4 kHz: fine enough to see a detent ring, 2 s of history.
pub const CAPTURE_EVERY: u32 = (CONTROL_HZ / 4_000) as u32;
pub const SAMPLES: usize = 8_192;
/// Samples per JSON line when dumping; keeps each line well under 2 KiB.
pub const CHUNK: usize = 32;

/// One recorded tick.
#[derive(Clone, Copy)]
pub struct Sample {
    pub time_us: u32,
    pub angle: u16,
    /// The drive in mV; `OFF` and `SHORTED` for those.
    pub drive_mv: i16,
    /// Flywheel minus knob, in 1/65536 turn, saturating.
    pub stretch: i16,
}

pub const OFF: i16 = i16::MIN;
pub const SHORTED: i16 = i16::MIN + 1;

type History = HistoryBuffer<Sample, SAMPLES>;

static HISTORY: Mutex<RefCell<History>> = Mutex::new(RefCell::new(HistoryBuffer::new()));
static FROZEN: AtomicBool = AtomicBool::new(false);

/// Timestamps keep only the low 32 bits of the microsecond clock; the host
/// unwraps them from sample-to-sample differences.
pub fn record(sample: Sample) {
    if !FROZEN.load(Ordering::Acquire) {
        critical_section::with(|cs| HISTORY.borrow_ref_mut(cs).write(sample));
    }
}

/// Pause recording while the history is being sent, so it cannot change underneath.
pub fn freeze(frozen: bool) {
    FROZEN.store(frozen, Ordering::Release);
}

pub fn len() -> usize {
    critical_section::with(|cs| HISTORY.borrow_ref(cs).len())
}

/// One line's worth of samples, as columns.
#[derive(Default)]
pub struct Chunk {
    pub time_us: Vec<u32, CHUNK>,
    pub angle: Vec<u16, CHUNK>,
    pub drive_mv: Vec<i16, CHUNK>,
    pub stretch: Vec<i16, CHUNK>,
}

/// Copy samples `offset..offset + CHUNK`, oldest first.
pub fn chunk(offset: usize, out: &mut Chunk) {
    out.time_us.clear();
    out.angle.clear();
    out.drive_mv.clear();
    out.stretch.clear();
    // Index the two halves of the ring directly: the control interrupt waits
    // while this holds the lock, so it must not walk the whole history.
    critical_section::with(|cs| {
        let history = HISTORY.borrow_ref(cs);
        let (older, newer) = history.as_slices();
        for sample in older.iter().chain(newer).skip(offset).take(CHUNK) {
            let _ = out.time_us.push(sample.time_us);
            let _ = out.angle.push(sample.angle);
            let _ = out.drive_mv.push(sample.drive_mv);
            let _ = out.stretch.push(sample.stretch);
        }
    });
}
