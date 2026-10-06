#![no_std]
#![no_main]

mod board;
mod capture;
mod encoder;
mod knob;
mod link;
mod motor;

use core::cell::RefCell;
use critical_section::Mutex;
use embassy_executor::Spawner;
use esp_hal::{
    clock::CpuClock,
    gpio::{Input, InputConfig, Level, Output, OutputConfig, Pull},
    handler,
    interrupt::{self, Priority},
    peripherals::Interrupt,
    time::Duration,
    timer::timg::{MwdtStage, TimerGroup},
    usb::usb_serial_jtag::UsbSerialJtag,
};
use knob::{Knob, Magnet, Parts};
use rcade_haptics_core::output::Drive; // TEMPORARY
use static_cell::StaticCell;

esp_bootloader_esp_idf::esp_app_desc!();

/// The knob, owned by the control interrupt once set up.
static KNOB: Mutex<RefCell<Option<Knob>>> = Mutex::new(RefCell::new(None));
static DEVICE_ID: StaticCell<heapless::String<32>> = StaticCell::new();

/// If the control interrupt stops for this long, reset the chip.
const WATCHDOG: Duration = Duration::from_millis(100);

/// One control tick. Runs every PWM period (20 kHz), straight from the interrupt.
fn tick(knob: &mut Knob) {
    knob.clock.start();
    let motion = match knob.encoder.read() {                    // sense
        Ok(angle) => knob.motion.update(angle),
        Err(fault) => return knob.glitch(fault),
    };
    knob.clock.lap(0);

    if let Ok(event) = link::INBOX.try_receive() {             // listen
        knob.handle(event);
    }
    knob.check();
    knob.clock.lap(1);

    let drive = match knob.magnet {                             // think
        Magnet::Finding(_) => knob.align(&motion),              // boot: find the magnet first
        Magnet::Found(_) => {
            let feel = knob.curves.at(knob.flywheel.position()); // f(x) from the curves
            let push = knob.flywheel.step(&motion, feel)       // stock curves → exactly zero
                + knob.effects.next();                          // later: rumble, after the physics
            // TEMPORARY: raw excitation for measuring the knob.
            match (knob.effects.raw, knob.effects.d_axis, &knob.magnet) {
                (true, true, Magnet::Found(c)) => Drive::Field { volts: push, electrical: c.electrical(motion.angle) },
                (true, _, _) => Drive::Volts(push),
                _ => knob.output.shape(push, &motion),
            }
        }
    };
    knob.clock.lap(2);
    knob.act(drive, &motion);                                   // act
    knob.clock.lap(3);

    knob.report(&motion, drive);                                // send
    knob.watchdog.feed();
    knob.clock.stop();
}

#[handler(priority = Priority::Priority3)]
fn pwm_period() {
    if motor::period_elapsed() {
        critical_section::with(|cs| {
            if let Some(knob) = KNOB.borrow_ref_mut(cs).as_mut() {
                tick(knob);
            }
        });
    }
}

#[panic_handler]
fn panic(info: &core::panic::PanicInfo) -> ! {
    motor::emergency_off();
    // Plain text on the USB serial line: hosts skip it as non-JSON, and it
    // says why the knob stopped before the watchdog restarts it.
    esp_println::println!("panic: {info}");
    loop {
        core::hint::spin_loop();
    }
}

#[esp_rtos::main]
async fn main(spawner: Spawner) {
    let p = esp_hal::init(esp_hal::Config::default().with_cpu_clock(CpuClock::max()));
    // Parsing a command allocates its curve points here; the control loop never allocates.
    esp_alloc::heap_allocator!(size: 64 * 1024);

    let id = DEVICE_ID.init(board::device_id()).as_str();

    // USB runs as async tasks; the control interrupt preempts them.
    let timg0 = TimerGroup::new(p.TIMG0);
    esp_rtos::start(timg0.timer0, p.FROM_CPU_INTR0);
    let (rx, tx) = UsbSerialJtag::new(p.USB_DEVICE).into_async().split();
    spawner.spawn(link::receive(rx).unwrap());
    spawner.spawn(link::transmit(tx, id).unwrap());

    let mut watchdog = TimerGroup::new(p.TIMG1).wdt;
    watchdog.set_timeout(MwdtStage::Stage0, WATCHDOG);
    watchdog.enable();
    let parts = Parts {
        buzzer: Output::new(p.GPIO18, Level::Low, OutputConfig::default()),
        motor: motor::Motor::new(p.MCPWM0, p.GPIO6, p.GPIO5, p.GPIO1, p.GPIO3, p.GPIO0, p.GPIO4),
        encoder: encoder::Encoder::new(p.SPI2, p.GPIO14, p.GPIO15, p.GPIO7),
        driver_fault: Input::new(p.GPIO2, InputConfig::default().with_pull(Pull::Down)),
        watchdog,
    };
    let knob = Knob::new(parts, id);
    critical_section::with(|cs| KNOB.replace(cs, Some(knob)));
    interrupt::bind_handler(Interrupt::MCPWM0, pwm_period);
    core::future::pending::<()>().await;
}
