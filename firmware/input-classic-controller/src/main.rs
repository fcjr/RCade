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
use defmt::info;
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
use portable_atomic::AtomicI32;
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

// Spinner accumulators
static SPINNER1_DELTA: AtomicI32 = AtomicI32::new(0);
static SPINNER2_DELTA: AtomicI32 = AtomicI32::new(0);

// Input state
static P1_STATE: AtomicU8 = AtomicU8::new(0);
static P2_STATE: AtomicU8 = AtomicU8::new(0);
static SYSTEM_STATE: AtomicU8 = AtomicU8::new(0);

// Input bit masks for p1/p2
const INPUT_UP: u8 = 1 << 0;
const INPUT_DOWN: u8 = 1 << 1;
const INPUT_LEFT: u8 = 1 << 2;
const INPUT_RIGHT: u8 = 1 << 3;
const INPUT_BTN_A: u8 = 1 << 4;
const INPUT_BTN_B: u8 = 1 << 5;
const INPUT_BTN_C: u8 = 1 << 6;
const INPUT_BTN_D: u8 = 1 << 7;

// System bit masks
const SYS_1P_START: u8 = 1 << 0;
const SYS_2P_START: u8 = 1 << 1;
const SYS_MENU: u8 = 1 << 2;
const SYS_P1_BTN_E: u8 = 1 << 3;
const SYS_P1_BTN_F: u8 = 1 << 4;
const SYS_P2_BTN_E: u8 = 1 << 5;
const SYS_P2_BTN_F: u8 = 1 << 6;

// Static buffers
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

struct PlayerInputs {
    j_up: Input<'static>,
    j_down: Input<'static>,
    j_left: Input<'static>,
    j_right: Input<'static>,
    btn_a: Input<'static>,
    btn_b: Input<'static>,
    btn_c: Input<'static>,
    btn_d: Input<'static>,
    btn_e: Input<'static>,
    btn_f: Input<'static>,
}

impl PlayerInputs {
    fn read_joystick_and_abcd(&self) -> u8 {
        (if self.j_up.is_low() { INPUT_UP } else { 0 })
            | (if self.j_down.is_low() { INPUT_DOWN } else { 0 })
            | (if self.j_left.is_low() { INPUT_LEFT } else { 0 })
            | (if self.j_right.is_low() { INPUT_RIGHT } else { 0 })
            | (if self.btn_a.is_low() { INPUT_BTN_A } else { 0 })
            | (if self.btn_b.is_low() { INPUT_BTN_B } else { 0 })
            | (if self.btn_c.is_low() { INPUT_BTN_C } else { 0 })
            | (if self.btn_d.is_low() { INPUT_BTN_D } else { 0 })
    }
}

fn process_spinner_byte(byte: u8, delta: &AtomicI32) {
    match byte {
        0x01 => { delta.fetch_add(1, Ordering::Relaxed); }
        0xFE => { delta.fetch_add(-1, Ordering::Relaxed); }
        _ => {}
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
        UART0_TX.init([0; 16]), UART0_RX.init([0; 256]), uart_cfg,
    );
    let uart1 = BufferedUart::new(
        p.UART1, Irqs, p.PIN_4, p.PIN_5,
        UART1_TX.init([0; 16]), UART1_RX.init([0; 256]), uart_cfg,
    );

    let p1 = PlayerInputs {
        j_up: Input::new(p.PIN_6, Pull::Up),
        j_down: Input::new(p.PIN_7, Pull::Up),
        j_left: Input::new(p.PIN_8, Pull::Up),
        j_right: Input::new(p.PIN_9, Pull::Up),
        btn_a: Input::new(p.PIN_10, Pull::Up),
        btn_b: Input::new(p.PIN_11, Pull::Up),
        btn_c: Input::new(p.PIN_12, Pull::Up),
        btn_d: Input::new(p.PIN_13, Pull::Up),
        btn_e: Input::new(p.PIN_14, Pull::Up),
        btn_f: Input::new(p.PIN_15, Pull::Up),
    };

    let p2 = PlayerInputs {
        j_up: Input::new(p.PIN_16, Pull::Up),
        j_down: Input::new(p.PIN_17, Pull::Up),
        j_left: Input::new(p.PIN_18, Pull::Up),
        j_right: Input::new(p.PIN_19, Pull::Up),
        btn_a: Input::new(p.PIN_20, Pull::Up),
        btn_b: Input::new(p.PIN_21, Pull::Up),
        btn_c: Input::new(p.PIN_22, Pull::Up),
        btn_d: Input::new(p.PIN_26, Pull::Up),
        btn_e: Input::new(p.PIN_27, Pull::Up),
        btn_f: Input::new(p.PIN_28, Pull::Up),
    };

    let start_1p = Input::new(p.PIN_2, Pull::Up);
    let start_2p = Input::new(p.PIN_3, Pull::Up);
    let menu = Input::new(p.PIN_29, Pull::Up);

    spawner.spawn(spinner1_task(uart0)).unwrap();
    spawner.spawn(spinner2_task(uart1)).unwrap();
    spawner.spawn(input_task(p1, p2, start_1p, start_2p, menu)).unwrap();

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
async fn spinner1_task(mut uart: BufferedUart<'static, UART0>) {
    let mut buf = [0u8; 1];
    loop {
        match select(uart.read(&mut buf), Timer::after_micros(50)).await {
            Either::First(Ok(_)) => process_spinner_byte(buf[0], &SPINNER1_DELTA),
            _ => {}
        }
    }
}

#[embassy_executor::task]
async fn spinner2_task(mut uart: BufferedUart<'static, UART1>) {
    let mut buf = [0u8; 1];
    loop {
        match select(uart.read(&mut buf), Timer::after_micros(50)).await {
            Either::First(Ok(_)) => process_spinner_byte(buf[0], &SPINNER2_DELTA),
            _ => {}
        }
    }
}

#[embassy_executor::task]
async fn input_task(
    p1: PlayerInputs,
    p2: PlayerInputs,
    start_1p: Input<'static>,
    start_2p: Input<'static>,
    menu: Input<'static>,
) {
    let mut last_p1 = 0u8;
    let mut last_p2 = 0u8;
    let mut last_sys = 0u8;

    loop {
        let p1_state = p1.read_joystick_and_abcd();
        let p2_state = p2.read_joystick_and_abcd();

        let sys = (if start_1p.is_low() { SYS_1P_START } else { 0 })
            | (if start_2p.is_low() { SYS_2P_START } else { 0 })
            | (if menu.is_low() { SYS_MENU } else { 0 })
            | (if p1.btn_e.is_low() { SYS_P1_BTN_E } else { 0 })
            | (if p1.btn_f.is_low() { SYS_P1_BTN_F } else { 0 })
            | (if p2.btn_e.is_low() { SYS_P2_BTN_E } else { 0 })
            | (if p2.btn_f.is_low() { SYS_P2_BTN_F } else { 0 });

        if p1_state != last_p1 || p2_state != last_p2 || sys != last_sys {
            P1_STATE.store(p1_state, Ordering::Relaxed);
            P2_STATE.store(p2_state, Ordering::Relaxed);
            SYSTEM_STATE.store(sys, Ordering::Relaxed);
            last_p1 = p1_state;
            last_p2 = p2_state;
            last_sys = sys;
        }

        Timer::after_micros(500).await;
    }
}

#[embassy_executor::task]
async fn hid_task(mut writer: embassy_usb::class::hid::HidWriter<'static, Driver<'static, USB>, 8>) {
    loop {
        Timer::after_millis(5).await;

        let d1 = SPINNER1_DELTA.swap(0, Ordering::Relaxed) as i16;
        let d2 = SPINNER2_DELTA.swap(0, Ordering::Relaxed) as i16;
        let p1 = P1_STATE.load(Ordering::Relaxed);
        let p2 = P2_STATE.load(Ordering::Relaxed);
        let sys = SYSTEM_STATE.load(Ordering::Relaxed);

        let _ = writer.write(&[
            d1 as u8, (d1 >> 8) as u8,
            d2 as u8, (d2 >> 8) as u8,
            p1, p2, sys, 0,
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
