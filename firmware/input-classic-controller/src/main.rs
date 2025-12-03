//! Input Classic Controller - USB Raw HID
//!
//! Supports:
//!   - 2x GRS Spinners (UART)
//!   - 2x 4-way Joysticks (GPIO)
//!   - 6x Action buttons per player
//!   - 1P Start / 2P Start buttons
//!   - 1x Menu button
//!
//! Wiring (active low, directly to GND when pressed):
//!
//!   Spinners (UART RX):
//!     Spinner 1: TX->GPIO1 (pin 2)
//!     Spinner 2: TX->GPIO5 (pin 7)
//!
//!   Player 1:
//!     Joystick: UP->GPIO6, DOWN->GPIO7, LEFT->GPIO8, RIGHT->GPIO9
//!     Buttons:  A->GPIO10, B->GPIO11, C->GPIO12, D->GPIO13, E->GPIO14, F->GPIO15
//!
//!   Player 2:
//!     Joystick: UP->GPIO16, DOWN->GPIO17, LEFT->GPIO18, RIGHT->GPIO19
//!     Buttons:  A->GPIO20, B->GPIO21, C->GPIO22, D->GPIO26, E->GPIO27, F->GPIO28
//!
//!   System:
//!     1P Start->GPIO2, 2P Start->GPIO3, Menu->GPIO29
//!
//!   Power: GND->GND, 5V->VBUS (pin 40)
//!
//! HID Report (8 bytes):
//!   [spin1_lo, spin1_hi, spin2_lo, spin2_hi, p1_inputs, p2_inputs, system, 0]
//!   p1/p2 bits: 0=up, 1=down, 2=left, 3=right, 4=btn_a, 5=btn_b, 6=btn_c, 7=btn_d
//!   system bits: 0=1p_start, 1=2p_start, 2=menu, 3=p1_btn_e, 4=p1_btn_f, 5=p2_btn_e, 6=p2_btn_f

#![no_std]
#![no_main]

use core::sync::atomic::{AtomicU8, Ordering};
use portable_atomic::AtomicI32;
use defmt::*;
use embassy_executor::Spawner;
use embassy_futures::select::{select, Either};
use embassy_rp::bind_interrupts;
use embassy_rp::gpio::{Input, Pull};
use embassy_rp::peripherals::{UART0, UART1, USB};
use embassy_rp::uart::{
    BufferedInterruptHandler, BufferedUart, Config as UartConfig, DataBits, Parity, StopBits,
};
use embassy_rp::usb::{Driver, InterruptHandler as UsbInterruptHandler};
use embassy_time::Timer;
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
    0x09, 0x01, // Usage (Vendor Usage 1)
    0xA1, 0x01, // Collection (Application)
    0x09, 0x02, //   Usage (Vendor Usage 2)
    0x15, 0x00, //   Logical Minimum (0)
    0x26, 0xFF, 0x00, //   Logical Maximum (255)
    0x75, 0x08, //   Report Size (8 bits)
    0x95, 0x08, //   Report Count (8 bytes)
    0x81, 0x02, //   Input (Data, Var, Abs)
    0xC0, // End Collection
];

// Spinner accumulators (atomic to avoid signal loss)
static SPINNER1_DELTA: AtomicI32 = AtomicI32::new(0);
static SPINNER2_DELTA: AtomicI32 = AtomicI32::new(0);

// Input state (updated by input task, read by HID task)
static P1_STATE: AtomicU8 = AtomicU8::new(0);
static P2_STATE: AtomicU8 = AtomicU8::new(0);
static SYSTEM_STATE: AtomicU8 = AtomicU8::new(0);

// Input bit masks for p1/p2 (byte 4/5)
const INPUT_UP: u8 = 1 << 0;
const INPUT_DOWN: u8 = 1 << 1;
const INPUT_LEFT: u8 = 1 << 2;
const INPUT_RIGHT: u8 = 1 << 3;
const INPUT_BTN_A: u8 = 1 << 4;
const INPUT_BTN_B: u8 = 1 << 5;
const INPUT_BTN_C: u8 = 1 << 6;
const INPUT_BTN_D: u8 = 1 << 7;

// System bit masks (byte 6)
const SYS_1P_START: u8 = 1 << 0;
const SYS_2P_START: u8 = 1 << 1;
const SYS_MENU: u8 = 1 << 2;
const SYS_P1_BTN_E: u8 = 1 << 3;
const SYS_P1_BTN_F: u8 = 1 << 4;
const SYS_P2_BTN_E: u8 = 1 << 5;
const SYS_P2_BTN_F: u8 = 1 << 6;

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

    // UART config for spinners
    let uart_cfg = {
        let mut c = UartConfig::default();
        c.baudrate = 115200;
        c.data_bits = DataBits::DataBits8;
        c.stop_bits = StopBits::STOP1;
        c.parity = Parity::ParityNone;
        c
    };

    // Spinner UARTs (RX only, TX pins unused but required by API)
    // Spinner 1: RX on GPIO1 (UART0)
    // Spinner 2: RX on GPIO5 (UART1)
    let uart0 = BufferedUart::new(
        p.UART0,
        Irqs,
        p.PIN_0,
        p.PIN_1,
        UART0_TX.init([0; 16]),
        UART0_RX.init([0; 256]),
        uart_cfg,
    );
    let uart1 = BufferedUart::new(
        p.UART1,
        Irqs,
        p.PIN_4,
        p.PIN_5,
        UART1_TX.init([0; 16]),
        UART1_RX.init([0; 256]),
        uart_cfg,
    );

    // System buttons
    let start_1p = Input::new(p.PIN_2, Pull::Up);
    let start_2p = Input::new(p.PIN_3, Pull::Up);
    let menu = Input::new(p.PIN_29, Pull::Up);

    // Player 1 joystick (GPIO 6-9)
    let j1_up = Input::new(p.PIN_6, Pull::Up);
    let j1_down = Input::new(p.PIN_7, Pull::Up);
    let j1_left = Input::new(p.PIN_8, Pull::Up);
    let j1_right = Input::new(p.PIN_9, Pull::Up);

    // Player 1 buttons (GPIO 10-15)
    let p1_btn_a = Input::new(p.PIN_10, Pull::Up);
    let p1_btn_b = Input::new(p.PIN_11, Pull::Up);
    let p1_btn_c = Input::new(p.PIN_12, Pull::Up);
    let p1_btn_d = Input::new(p.PIN_13, Pull::Up);
    let p1_btn_e = Input::new(p.PIN_14, Pull::Up);
    let p1_btn_f = Input::new(p.PIN_15, Pull::Up);

    // Player 2 joystick (GPIO 16-19)
    let j2_up = Input::new(p.PIN_16, Pull::Up);
    let j2_down = Input::new(p.PIN_17, Pull::Up);
    let j2_left = Input::new(p.PIN_18, Pull::Up);
    let j2_right = Input::new(p.PIN_19, Pull::Up);

    // Player 2 buttons (GPIO 20-22, 26-28)
    let p2_btn_a = Input::new(p.PIN_20, Pull::Up);
    let p2_btn_b = Input::new(p.PIN_21, Pull::Up);
    let p2_btn_c = Input::new(p.PIN_22, Pull::Up);
    let p2_btn_d = Input::new(p.PIN_26, Pull::Up);
    let p2_btn_e = Input::new(p.PIN_27, Pull::Up);
    let p2_btn_f = Input::new(p.PIN_28, Pull::Up);

    spawner.spawn(spinners_task(uart0, uart1)).unwrap();
    spawner
        .spawn(input_task(
            j1_up, j1_down, j1_left, j1_right, j2_up, j2_down, j2_left, j2_right, p1_btn_a,
            p1_btn_b, p1_btn_c, p1_btn_d, p1_btn_e, p1_btn_f, p2_btn_a, p2_btn_b, p2_btn_c,
            p2_btn_d, p2_btn_e, p2_btn_f, start_1p, start_2p, menu,
        ))
        .unwrap();

    // USB config
    let mut usb_config = Config::new(0x1209, 0x0001);
    usb_config.manufacturer = Some("RCade");
    usb_config.product = Some("Input Classic Controller");
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

    let hid = HidReaderWriter::<_, 1, 8>::new(
        &mut builder,
        HID_STATE.init(State::new()),
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
async fn spinners_task(
    mut uart0: BufferedUart<'static, UART0>,
    mut uart1: BufferedUart<'static, UART1>,
) {
    let mut buf0 = [0u8; 1];
    let mut buf1 = [0u8; 1];

    loop {
        match select(uart0.read(&mut buf0), uart1.read(&mut buf1)).await {
            Either::First(Ok(_)) => match buf0[0] {
                0x01 => { SPINNER1_DELTA.fetch_add(1, Ordering::Relaxed); }
                0xFE => { SPINNER1_DELTA.fetch_add(-1, Ordering::Relaxed); }
                _ => {}
            },
            Either::Second(Ok(_)) => match buf1[0] {
                0x01 => { SPINNER2_DELTA.fetch_add(1, Ordering::Relaxed); }
                0xFE => { SPINNER2_DELTA.fetch_add(-1, Ordering::Relaxed); }
                _ => {}
            },
            _ => {}
        }
    }
}

#[embassy_executor::task]
#[allow(clippy::too_many_arguments)]
async fn input_task(
    j1_up: Input<'static>,
    j1_down: Input<'static>,
    j1_left: Input<'static>,
    j1_right: Input<'static>,
    j2_up: Input<'static>,
    j2_down: Input<'static>,
    j2_left: Input<'static>,
    j2_right: Input<'static>,
    p1_btn_a: Input<'static>,
    p1_btn_b: Input<'static>,
    p1_btn_c: Input<'static>,
    p1_btn_d: Input<'static>,
    p1_btn_e: Input<'static>,
    p1_btn_f: Input<'static>,
    p2_btn_a: Input<'static>,
    p2_btn_b: Input<'static>,
    p2_btn_c: Input<'static>,
    p2_btn_d: Input<'static>,
    p2_btn_e: Input<'static>,
    p2_btn_f: Input<'static>,
    start_1p: Input<'static>,
    start_2p: Input<'static>,
    menu: Input<'static>,
) {
    let mut last_p1 = 0u8;
    let mut last_p2 = 0u8;
    let mut last_sys = 0u8;

    loop {
        // Read player 1 inputs (active low - pressed = low)
        let p1 = (if j1_up.is_low() { INPUT_UP } else { 0 })
            | (if j1_down.is_low() { INPUT_DOWN } else { 0 })
            | (if j1_left.is_low() { INPUT_LEFT } else { 0 })
            | (if j1_right.is_low() { INPUT_RIGHT } else { 0 })
            | (if p1_btn_a.is_low() { INPUT_BTN_A } else { 0 })
            | (if p1_btn_b.is_low() { INPUT_BTN_B } else { 0 })
            | (if p1_btn_c.is_low() { INPUT_BTN_C } else { 0 })
            | (if p1_btn_d.is_low() { INPUT_BTN_D } else { 0 });

        // Read player 2 inputs
        let p2 = (if j2_up.is_low() { INPUT_UP } else { 0 })
            | (if j2_down.is_low() { INPUT_DOWN } else { 0 })
            | (if j2_left.is_low() { INPUT_LEFT } else { 0 })
            | (if j2_right.is_low() { INPUT_RIGHT } else { 0 })
            | (if p2_btn_a.is_low() { INPUT_BTN_A } else { 0 })
            | (if p2_btn_b.is_low() { INPUT_BTN_B } else { 0 })
            | (if p2_btn_c.is_low() { INPUT_BTN_C } else { 0 })
            | (if p2_btn_d.is_low() { INPUT_BTN_D } else { 0 });

        // Read system inputs (includes E/F buttons that overflow from p1/p2 bytes)
        let sys = (if start_1p.is_low() { SYS_1P_START } else { 0 })
            | (if start_2p.is_low() { SYS_2P_START } else { 0 })
            | (if menu.is_low() { SYS_MENU } else { 0 })
            | (if p1_btn_e.is_low() { SYS_P1_BTN_E } else { 0 })
            | (if p1_btn_f.is_low() { SYS_P1_BTN_F } else { 0 })
            | (if p2_btn_e.is_low() { SYS_P2_BTN_E } else { 0 })
            | (if p2_btn_f.is_low() { SYS_P2_BTN_F } else { 0 });

        // Update if changed
        if p1 != last_p1 || p2 != last_p2 || sys != last_sys {
            P1_STATE.store(p1, Ordering::Relaxed);
            P2_STATE.store(p2, Ordering::Relaxed);
            SYSTEM_STATE.store(sys, Ordering::Relaxed);
            last_p1 = p1;
            last_p2 = p2;
            last_sys = sys;
        }

        Timer::after_micros(500).await; // 2kHz polling
    }
}

#[embassy_executor::task]
async fn hid_task(
    mut writer: embassy_usb::class::hid::HidWriter<'static, Driver<'static, USB>, 8>,
) {
    loop {
        // Poll at fixed rate (200Hz = 5ms, matches HID poll_ms)
        Timer::after_millis(5).await;

        // Atomically read and clear spinner deltas
        let d1 = SPINNER1_DELTA.swap(0, Ordering::Relaxed);
        let d2 = SPINNER2_DELTA.swap(0, Ordering::Relaxed);

        let d1 = (d1 as i16).clamp(-32767, 32767);
        let d2 = (d2 as i16).clamp(-32767, 32767);
        let p1 = P1_STATE.load(Ordering::Relaxed);
        let p2 = P2_STATE.load(Ordering::Relaxed);
        let sys = SYSTEM_STATE.load(Ordering::Relaxed);

        let _ = writer
            .write(&[
                d1 as u8,
                (d1 >> 8) as u8,
                d2 as u8,
                (d2 >> 8) as u8,
                p1,
                p2,
                sys,
                0,
            ])
            .await;
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
