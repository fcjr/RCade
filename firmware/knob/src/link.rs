//! The USB link: commands in, messages out. Runs as ordinary async tasks; the
//! control loop only ever `try`s these channels, so it never waits on a host.

use embassy_sync::{blocking_mutex::raw::CriticalSectionRawMutex, channel::Channel};
use embassy_time::{Duration, with_timeout};
use embedded_io_async::{Read, Write};
use esp_hal::{Async, usb::usb_serial_jtag::{UsbSerialJtagRx, UsbSerialJtagTx}};
use rcade_haptics_core::{Command, Config, Feelings, Message, alignment::Commutation, protocol::{Id, Lines}};
use static_cell::{ConstStaticCell, StaticCell};

use crate::capture;

/// Everything the knob hears about, in the order it happened, with the id
/// its reply echoes.
pub enum Event {
    Command(Command, Id),
    /// A new config, already baked. The knob hands the old bank back.
    Curves(&'static mut Feelings, Id),
}

/// What the knob says. Converted to a `Message` by the transmit task.
pub enum Reply {
    Hello { magnet: Option<Commutation> },
    /// A command was done at `time_us` on the knob's clock.
    Ack(&'static str, Id, u64),
    Error(&'static str, Id),
    Status(&'static str),
    Stats { ticks: u32, worst_tick_us: u32, overruns: u32, encoder_errors: u32, phases_us: [u32; 4] },
    Tick { angle: u16, global_angle: i64, curve_angle: i64, velocity_q16: i32, time_us: u64 },
    CaptureDump,
}

pub static INBOX: Channel<CriticalSectionRawMutex, Event, 4> = Channel::new();
pub static OUTBOX: Channel<CriticalSectionRawMutex, Reply, 16> = Channel::new();
/// Banks the knob has finished with, ready to bake the next config into.
pub static SPARE_BANKS: Channel<CriticalSectionRawMutex, &'static mut Feelings, 2> = Channel::new();

/// Built at compile time: these are too big to ever pass through a stack.
static BANKS: ConstStaticCell<[Feelings; 2]> = ConstStaticCell::new([Feelings::STOCK, Feelings::STOCK]);
/// The line being received.
static LINES: ConstStaticCell<Lines> = ConstStaticCell::new(Lines::new());
/// Where each incoming config is parsed to, before it's baked into a bank.
static SLOT: StaticCell<Config> = StaticCell::new();

/// Set up the banks, the config slot and the line buffer.
#[inline(never)]
fn storage() -> (&'static mut Config, &'static mut Lines) {
    for bank in BANKS.take() {
        let _ = SPARE_BANKS.try_send(bank);
    }
    (SLOT.init_with(Config::stock), LINES.take())
}

/// A line that can't go out in this long is dropped. A host that stops
/// reading (a closed port, a suspended USB link) must never wedge the link:
/// esp-hal's USB write waits for the host forever, and can miss the event
/// that would wake it, leaving the knob silent until reset.
const SEND_TIMEOUT: Duration = Duration::from_millis(100);

/// How often the receive task looks for bytes it wasn't woken for.
const READ_RECHECK: Duration = Duration::from_millis(50);

/// Say something without waiting. If the host stopped reading, it's dropped.
pub fn reply(message: Reply) {
    let _ = OUTBOX.try_send(message);
}

#[embassy_executor::task]
pub async fn receive(mut rx: UsbSerialJtagRx<'static, Async>) {
    let (slot, lines) = storage();
    let mut buffer = [0u8; 64];
    loop {
        // Look again every so often even without a wake-up: like writes,
        // esp-hal's USB read can miss the event that would wake it.
        let count = match with_timeout(READ_RECHECK, rx.read(&mut buffer)).await {
            Ok(read) => read.unwrap_or(0),
            Err(_) => continue,
        };
        for &byte in &buffer[..count] {
            match lines.push(byte, slot) {
                None => {}
                Some((id, Err(error))) => reply(Reply::Error(error, id)),
                Some((id, Ok(Command::Config))) => match slot.validate() {
                    // Baking takes microseconds, but it happens here anyway so
                    // the tick only swaps banks, and never waits on a config.
                    Ok(()) => {
                        let bank = SPARE_BANKS.receive().await;
                        slot.bake_into(bank);
                        INBOX.send(Event::Curves(bank, id)).await;
                    }
                    Err(error) => reply(Reply::Error(error, id)),
                },
                Some((id, Ok(command))) => INBOX.send(Event::Command(command, id)).await,
            }
        }
    }
}

#[embassy_executor::task]
pub async fn transmit(mut tx: UsbSerialJtagTx<'static, Async>, id: &'static str) {
    let mut buffer = [0u8; 2048];
    loop {
        let message = OUTBOX.receive().await;

        let message = match &message {
            Reply::CaptureDump => {
                dump_capture(&mut tx, &mut buffer).await;
                continue;
            }
            &Reply::Hello { magnet } => {
                let hello = Message::Hello {
                    device: "rcade-tknob", id,
                    magnet, max_points: rcade_haptics_core::curves::MAX_POINTS,
                };
                // A host that just said hello is reading. If even this reply
                // can't get out, the USB link is stuck for good: restart.
                if !send(&mut tx, &hello, &mut buffer).await {
                    crate::motor::emergency_off();
                    esp_hal::system::software_reset();
                }
                continue;
            }
            &Reply::Ack(command, id, time_us) => Message::Ack { command, id, time_us },
            &Reply::Error(message, id) => Message::Error { message, id },
            Reply::Status(reason) => Message::Status { reason },
            &Reply::Stats { ticks, worst_tick_us, overruns, encoder_errors, phases_us } =>
                Message::Stats { ticks, worst_tick_us, overruns, encoder_errors, phases_us },
            &Reply::Tick { angle, global_angle, curve_angle, velocity_q16, time_us } => Message::Tick { angle, global_angle, curve_angle, velocity_q16, time_us },
        };
        send(&mut tx, &message, &mut buffer).await;
    }
}

/// Send one line. Returns false if it couldn't go out in time.
async fn send(tx: &mut UsbSerialJtagTx<'static, Async>, message: &Message<'_>, buffer: &mut [u8; 2048]) -> bool {
    let Ok(length) = serde_json_core::to_slice(message, &mut buffer[..2047]) else { return true };
    buffer[length] = b'\n';
    let line = &buffer[..length + 1];
    let write = async {
        let _ = tx.write_all(line).await;
        let _ = tx.flush().await;
    };
    with_timeout(SEND_TIMEOUT, write).await.is_ok()
}

/// Send the raw history, oldest first. Recording pauses meanwhile, and ticks
/// queue up behind it, since this task sends both.
async fn dump_capture(tx: &mut UsbSerialJtagTx<'static, Async>, buffer: &mut [u8; 2048]) {
    capture::freeze(true);
    let count = capture::len();
    send(tx, &Message::Capture { count }, buffer).await;
    let mut chunk = capture::Chunk::default();
    for offset in (0..count).step_by(capture::CHUNK) {
        capture::chunk(offset, &mut chunk);
        let message = Message::CaptureChunk {
            time_us: &chunk.time_us, angle: &chunk.angle, drive_mv: &chunk.drive_mv, stretch: &chunk.stretch,
        };
        send(tx, &message, buffer).await;
    }
    send(tx, &Message::CaptureEnd, buffer).await;
    capture::freeze(false);
}
