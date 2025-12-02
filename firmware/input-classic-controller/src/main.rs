//! Dual GRS Spinner to USB Raw HID
//!
//! Wiring:
//!   Spinner 1: GND->GND, 5V->VBUS(40), TX->GPIO1(pin 2)
//!   Spinner 2: GND->GND, 5V->VBUS(40), TX->GPIO5(pin 7)
//!
//! HID Report: [spin1_lo, spin1_hi, spin2_lo, spin2_hi, 0, 0, 0, 0]

#![no_std]
#![no_main]

use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::select::{select, Either};
use embassy_rp::bind_interrupts;
use embassy_rp::peripherals::{UART0, UART1, USB};
use embassy_rp::uart::{BufferedInterruptHandler, BufferedUart, Config as UartConfig, DataBits, Parity, StopBits};
use embassy_rp::usb::{Driver, InterruptHandler as UsbInterruptHandler};
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;
use embassy_sync::signal::Signal;
use embassy_usb::class::hid::{HidReaderWriter, State};
use embassy_usb::{Builder, Config, Handler};
use embedded_io_async::Read;
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
    0x95, 0x08,       //   Report Count (8 bytes)
    0x81, 0x02,       //   Input (Data, Var, Abs)
    0xC0,             // End Collection
];

static SPINNER1: Signal<CriticalSectionRawMutex, i32> = Signal::new();
static SPINNER2: Signal<CriticalSectionRawMutex, i32> = Signal::new();

static CONFIG_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static BOS_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static MSOS_DESC: StaticCell<[u8; 256]> = StaticCell::new();
static CONTROL_BUF: StaticCell<[u8; 64]> = StaticCell::new();
static DEVICE_HANDLER: StaticCell<DeviceHandler> = StaticCell::new();
static HID_STATE: StaticCell<State> = StaticCell::new();
static UART0_TX: StaticCell<[u8; 16]> = StaticCell::new();
static UART0_RX: StaticCell<[u8; 256]> = StaticCell::new();
static UART1_TX: StaticCell<[u8; 16]> = StaticCell::new();
static UART1_RX: StaticCell<[u8; 256]> = StaticCell::new();

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
        UART0_TX.init([0; 16]), UART0_RX.init([0; 256]), uart_cfg,
    );
    let uart1 = BufferedUart::new(
        p.UART1, Irqs, p.PIN_4, p.PIN_5,
        UART1_TX.init([0; 16]), UART1_RX.init([0; 256]), uart_cfg,
    );

    spawner.spawn(spinner1_task(uart0)).unwrap();
    spawner.spawn(spinner2_task(uart1)).unwrap();

    let mut usb_config = Config::new(0x1209, 0x0001);
    usb_config.manufacturer = Some("RCade");
    usb_config.product = Some("Input Classic Controller");
    usb_config.serial_number = Some("1");
    usb_config.max_power = 100;
    usb_config.max_packet_size_0 = 64;

    let mut builder = Builder::new(
        Driver::new(p.USB, Irqs), usb_config,
        CONFIG_DESC.init([0; 256]), BOS_DESC.init([0; 256]),
        MSOS_DESC.init([0; 256]), CONTROL_BUF.init([0; 64]),
    );
    builder.handler(DEVICE_HANDLER.init(DeviceHandler));

    let hid = HidReaderWriter::<_, 1, 8>::new(
        &mut builder, HID_STATE.init(State::new()),
        embassy_usb::class::hid::Config {
            report_descriptor: HID_DESCRIPTOR,
            request_handler: None,
            poll_ms: 5,
            max_packet_size: 8,
        },
    );

    let (_reader, writer) = hid.split();
    spawner.spawn(hid_task(writer)).unwrap();

    builder.build().run().await;
}

#[embassy_executor::task]
async fn spinner1_task(mut uart: BufferedUart<'static, UART0>) {
    let mut buf = [0u8; 1];
    let mut delta = 0i32;
    let mut count = 0u32;

    loop {
        if uart.read(&mut buf).await.is_ok() {
            count += 1;
            if count == 1 { info!("Spinner 1 connected"); }
            match buf[0] {
                0x01 => delta += 1,
                0xFE => delta -= 1,
                _ => {}
            }
            if count % 4 == 0 && delta != 0 {
                SPINNER1.signal(delta);
                delta = 0;
            }
        }
    }
}

#[embassy_executor::task]
async fn spinner2_task(mut uart: BufferedUart<'static, UART1>) {
    let mut buf = [0u8; 1];
    let mut delta = 0i32;
    let mut count = 0u32;

    loop {
        if uart.read(&mut buf).await.is_ok() {
            count += 1;
            if count == 1 { info!("Spinner 2 connected"); }
            match buf[0] {
                0x01 => delta += 1,
                0xFE => delta -= 1,
                _ => {}
            }
            if count % 4 == 0 && delta != 0 {
                SPINNER2.signal(delta);
                delta = 0;
            }
        }
    }
}

#[embassy_executor::task]
async fn hid_task(mut writer: embassy_usb::class::hid::HidWriter<'static, Driver<'static, USB>, 8>) {
    loop {
        let (d1, d2) = match select(SPINNER1.wait(), SPINNER2.wait()).await {
            Either::First(d) => (d, 0),
            Either::Second(d) => (0, d),
        };
        let d1 = (d1 as i16).clamp(-32767, 32767);
        let d2 = (d2 as i16).clamp(-32767, 32767);
        let _ = writer.write(&[
            d1 as u8, (d1 >> 8) as u8,
            d2 as u8, (d2 >> 8) as u8,
            0, 0, 0, 0,
        ]).await;
    }
}

struct DeviceHandler;

impl Handler for DeviceHandler {
    fn enabled(&mut self, _: bool) {}
    fn reset(&mut self) {}
    fn addressed(&mut self, _: u8) {}
    fn configured(&mut self, configured: bool) {
        if configured { info!("USB configured"); }
    }
}
