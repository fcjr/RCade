//! Spinner Controller - USB Raw HID
//!
//! Supports 2x GRS Spinners via UART.
//!
//! Wiring:
//!   Spinner 1: TX->GPIO1 (pin 2)
//!   Spinner 2: TX->GPIO5 (pin 7)
//!   Power: GND->GND, 5V->VBUS (pin 40)
//!
//! HID Report (4 bytes):
//!   [spin1_lo, spin1_hi, spin2_lo, spin2_hi]

#![no_std]
#![no_main]

use defmt::info;
use embassy_executor::Spawner;
use embassy_futures::yield_now;
use embassy_rp::bind_interrupts;
use embassy_rp::peripherals::{UART0, UART1, USB};
use embassy_rp::uart::{
    BufferedInterruptHandler, BufferedUart, Config as UartConfig, DataBits, Parity, StopBits,
};
use embassy_rp::usb::{Driver, InterruptHandler as UsbInterruptHandler};
use embassy_time::Timer;
use embassy_usb::class::hid::{HidReaderWriter, State};
use embassy_usb::{Builder, Config, Handler};
use embedded_io_async::Read;
use portable_atomic::{AtomicI32, Ordering};
use static_cell::StaticCell;
use {defmt_rtt as _, panic_probe as _};

bind_interrupts!(struct Irqs {
    USBCTRL_IRQ => UsbInterruptHandler<USB>;
    UART0_IRQ => BufferedInterruptHandler<UART0>;
    UART1_IRQ => BufferedInterruptHandler<UART1>;
});

const HID_DESCRIPTOR: &[u8] = &[
    0x06, 0x00, 0xFF, // Usage Page (Vendor Defined)
    0x09, 0x01,       // Usage (Vendor Usage 1)
    0xA1, 0x01,       // Collection (Application)
    0x09, 0x02,       //   Usage (Vendor Usage 2)
    0x15, 0x00,       //   Logical Minimum (0)
    0x26, 0xFF, 0x00, //   Logical Maximum (255)
    0x75, 0x08,       //   Report Size (8 bits)
    0x95, 0x04,       //   Report Count (4 bytes)
    0x81, 0x02,       //   Input (Data, Var, Abs)
    0xC0,             // End Collection
];

// Spinner accumulators
static SPINNER1_DELTA: AtomicI32 = AtomicI32::new(0);
static SPINNER2_DELTA: AtomicI32 = AtomicI32::new(0);

// Static buffers
static CONFIG_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static BOS_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static MSOS_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static CONTROL_BUF: StaticCell<[u8; 64]> = StaticCell::new();
static DEVICE_HANDLER: StaticCell<DeviceHandler> = StaticCell::new();
static HID_STATE: StaticCell<State> = StaticCell::new();
static UART0_TX: StaticCell<[u8; 16]> = StaticCell::new();
static UART0_RX: StaticCell<[u8; 1024]> = StaticCell::new();
static UART1_TX: StaticCell<[u8; 16]> = StaticCell::new();
static UART1_RX: StaticCell<[u8; 1024]> = StaticCell::new();

fn process_spinner_bytes(buf: &[u8], delta: &AtomicI32) {
    let mut acc: i32 = 0;
    for &byte in buf {
        match byte {
            0x01 => acc += 1,
            0xFE => acc -= 1,
            _ => {}
        }
    }
    if acc != 0 {
        delta.fetch_add(acc, Ordering::Relaxed);
    }
}

#[embassy_executor::main]
async fn main(spawner: Spawner) {
    let p = embassy_rp::init(Default::default());

    let uart_cfg = {
        let mut c = UartConfig::default();
        c.baudrate = 115200;
        c.data_bits = DataBits::DataBits8;
        c.stop_bits = StopBits::STOP1;
        c.parity = Parity::ParityNone;
        c
    };

    let uart0 = BufferedUart::new(
        p.UART0, Irqs, p.PIN_0, p.PIN_1,
        UART0_TX.init([0; 16]), UART0_RX.init([0; 1024]), uart_cfg,
    );
    let uart1 = BufferedUart::new(
        p.UART1, Irqs, p.PIN_4, p.PIN_5,
        UART1_TX.init([0; 16]), UART1_RX.init([0; 1024]), uart_cfg,
    );

    spawner.spawn(spinner1_task(uart0)).unwrap();
    spawner.spawn(spinner2_task(uart1)).unwrap();

    let mut usb_config = Config::new(0x1209, 0x0001);
    usb_config.manufacturer = Some("RCade");
    usb_config.product = Some("Spinner Controller");
    usb_config.serial_number = Some("1");
    usb_config.max_power = 100;
    usb_config.max_packet_size_0 = 64;

    let mut builder = Builder::new(
        Driver::new(p.USB, Irqs),
        usb_config,
        CONFIG_DESC.init([0; 256]),
        BOS_DESC.init([0; 256]),
        MSOS_DESC.init([0; 256]),
        CONTROL_BUF.init([0; 64]),
    );
    builder.handler(DEVICE_HANDLER.init(DeviceHandler));

    let hid = HidReaderWriter::<_, 1, 4>::new(
        &mut builder,
        HID_STATE.init(State::new()),
        embassy_usb::class::hid::Config {
            report_descriptor: HID_DESCRIPTOR,
            request_handler: None,
            poll_ms: 1,
            max_packet_size: 4,
        },
    );

    let (_reader, writer) = hid.split();
    spawner.spawn(hid_task(writer)).unwrap();

    builder.build().run().await;
}

#[embassy_executor::task]
async fn spinner1_task(mut uart: BufferedUart<'static, UART0>) {
    let mut buf = [0u8; 64];
    loop {
        match uart.read(&mut buf).await {
            Ok(n) if n > 0 => process_spinner_bytes(&buf[..n], &SPINNER1_DELTA),
            _ => {}
        }
        yield_now().await;
    }
}

#[embassy_executor::task]
async fn spinner2_task(mut uart: BufferedUart<'static, UART1>) {
    let mut buf = [0u8; 64];
    loop {
        match uart.read(&mut buf).await {
            Ok(n) if n > 0 => process_spinner_bytes(&buf[..n], &SPINNER2_DELTA),
            _ => {}
        }
        yield_now().await;
    }
}

#[embassy_executor::task]
async fn hid_task(mut writer: embassy_usb::class::hid::HidWriter<'static, Driver<'static, USB>, 4>) {
    loop {
        Timer::after_millis(1).await;

        let d1 = SPINNER1_DELTA.swap(0, Ordering::Relaxed) as i16;
        let d2 = SPINNER2_DELTA.swap(0, Ordering::Relaxed) as i16;

        let _ = writer.write(&[
            d1 as u8, (d1 >> 8) as u8,
            d2 as u8, (d2 >> 8) as u8,
        ]).await;
    }
}

struct DeviceHandler;

impl Handler for DeviceHandler {
    fn enabled(&mut self, _: bool) {}
    fn reset(&mut self) {}
    fn addressed(&mut self, _: u8) {}
    fn configured(&mut self, configured: bool) {
        if configured {
            info!("USB configured");
        }
    }
}
