use crate::board::{MOTOR_GATE_MASK, MOTOR_GATE_PINS};
use rcade_haptics_core::{output::Drive, svpwm::{self, PWM_PERIOD, SHORTED}, units::{Ratio, Volts}};
use core::sync::atomic::{AtomicBool, Ordering};
use esp_hal::{
    gpio::{Level, Output, OutputConfig, OutputSignal, Pull},
    peripherals::{GPIO, GPIO0, GPIO1, GPIO3, GPIO4, GPIO5, GPIO6, IO_MUX, MCPWM0, PCR},
};

use esp_hal::{
    mcpwm::{
        McPwm, PeripheralClockConfig,
        operator::{DeadTimeCfg, LinkedPins, PwmPinConfig},
        timer::{PwmWorkingMode, Timer},
    },
};
/// 160 MHz PLL / 4 = the 40 MHz PWM clock; 2000 counts of it is 20 kHz.
const PCR_DIVIDER: u8 = 4;
const DEADTIME_TICKS: u16 = 20; // 500 ns at the 40 MHz PWM clock

static EMERGENCY_STOP: AtomicBool = AtomicBool::new(false);

/// Last-resort shutdown for panic/fatal faults. This latches until a chip reset.
/// Call before halting, not followed by an automatic restart of the motor.
pub fn emergency_off() {
    critical_section::with(|_| {
        EMERGENCY_STOP.store(true, Ordering::Release);
        gates_low();
    });
}

/// Bypass PWM and its complementary-output inverter at the final GPIO matrix.
/// Merely forcing the PWM A generator low would turn the complementary B gate on.
fn gates_low() {
    let gpio = GPIO::regs();
    // SAFETY: These are write-one-to-clear/set registers for only our six motor
    // pins. The normal driver and emergency handler serialize through one core's
    // critical section; no other module may reconfigure these pins.
    gpio.out_w1tc()
        .write(|w| unsafe { w.bits(MOTOR_GATE_MASK) });
    for pin in MOTOR_GATE_PINS {
        gpio.func_out_sel_cfg(pin as usize).write(|w| unsafe {
            w.out_sel().bits(OutputSignal::GPIO as u8);
            w.inv_sel().clear_bit();
            w.oen_sel().set_bit();
            w.oen_inv_sel().clear_bit()
        });
        // This also covers a panic before Motor::new has initialized the IO mux.
        IO_MUX::regs().gpio(pin as usize).modify(|_, w| unsafe {
            w.mcu_sel().bits(1); // ESP32-C6 GPIO-matrix IO-mux function
            w.fun_wpu().clear_bit();
            w.fun_wpd().set_bit();
            w.slp_sel().clear_bit()
        });
    }
    gpio.enable_w1ts()
        .write(|w| unsafe { w.bits(MOTOR_GATE_MASK) });
}

/// Six-PWM TMC6300 adapter.
///
/// The PWM timer also clocks the control loop: see `period_elapsed`.
pub struct Motor {
    u: LinkedPins<'static, MCPWM0<'static>, 0>,
    v: LinkedPins<'static, MCPWM0<'static>, 1>,
    w: LinkedPins<'static, MCPWM0<'static>, 2>,
    _timer: Timer<0, MCPWM0<'static>>,
    pwm_routes: [u32; 6],
    connected: bool,
}

impl Motor {
    pub fn new(
        peripheral: MCPWM0<'static>,
        uh: GPIO6<'static>,
        ul: GPIO5<'static>,
        vh: GPIO1<'static>,
        vl: GPIO3<'static>,
        wh: GPIO0<'static>,
        wl: GPIO4<'static>,
    ) -> Self {
        let config = OutputConfig::default().with_pull(Pull::Down);
        let gates = [
            Output::new(uh, Level::Low, config),
            Output::new(ul, Level::Low, config),
            Output::new(vh, Level::Low, config),
            Output::new(vl, Level::Low, config),
            Output::new(wh, Level::Low, config),
            Output::new(wl, Level::Low, config),
        ];

        // The PWM clock is 40 MHz, set by the PCR divider below; both MCPWM
        // prescalers stay at 1. esp-hal 1.2 assumes an undivided 160 MHz
        // source, but the C6 boots with the PCR dividing it by 5, and the
        // knob measured 16 kHz instead of 20 kHz until this was pinned down.
        let clock = PeripheralClockConfig::with_prescaler(0);
        let timer_clock = clock.timer_clock_with_prescaler(PWM_PERIOD, PwmWorkingMode::Increase, 0);
        let mut pwm = McPwm::new(peripheral, clock);
        // SAFETY: only the MCPWM function clock divider: 160 MHz / (3 + 1).
        PCR::regs().pwm_clk_conf().modify(|_, w| unsafe { w.pwm_div_num().bits(PCR_DIVIDER - 1) });
        pwm.operator0.set_timer(&pwm.timer0);
        pwm.operator1.set_timer(&pwm.timer0);
        pwm.operator2.set_timer(&pwm.timer0);

        // Initialize the raw generators low BEFORE attaching pins. Bypass
        // deadtime/inversion during construction, so both gate inputs are low.
        force_generators_low(true);
        let [uh, ul, vh, vl, wh, wl] =
            gates.map(|pin| pin.into_peripheral_output().with_gpio_matrix_forced(true));
        let mut u = pwm.operator0.with_linked_pins(
            uh,
            PwmPinConfig::UP_ACTIVE_HIGH,
            ul,
            PwmPinConfig::EMPTY,
            DeadTimeCfg::new_bypass(),
        );
        let mut v = pwm.operator1.with_linked_pins(
            vh,
            PwmPinConfig::UP_ACTIVE_HIGH,
            vl,
            PwmPinConfig::EMPTY,
            DeadTimeCfg::new_bypass(),
        );
        let mut w = pwm.operator2.with_linked_pins(
            wh,
            PwmPinConfig::UP_ACTIVE_HIGH,
            wl,
            PwmPinConfig::EMPTY,
            DeadTimeCfg::new_bypass(),
        );
        let pwm_routes = MOTOR_GATE_PINS
            .map(|pin| GPIO::regs().func_out_sel_cfg(pin as usize).read().bits());
        critical_section::with(|_| gates_low());

        configure_pair(&mut u);
        configure_pair(&mut v);
        configure_pair(&mut w);
        force_generators_low(false);
        pwm.timer0.start(timer_clock);
        // One interrupt per PWM period, when the counter restarts: the control tick.
        MCPWM0::regs().int_ena().modify(|_, w| w.timer0_tez().set_bit());
        // PWM runs behind the disconnected GPIO matrix. No motor drive occurs.
        Self {
            u,
            v,
            w,
            _timer: pwm.timer0,
            pwm_routes,
            connected: false,
        }
    }

    pub fn disable(&mut self) {
        critical_section::with(|_| gates_low());
        self.connected = false;
        // Keep the disconnected PWM at the shorted duty, so any drive can
        // reconnect at once next tick without replaying an old one.
        self.write(SHORTED);
    }

    /// Do what `drive` says. `electrical` is the rotor's electrical angle
    /// and `forward` turns a push into q-axis volts; both come from the profile.
    /// `per_volt` is [`svpwm::per_volt`] of the supply.
    pub fn drive(&mut self, drive: Drive, electrical: u16, forward: impl Fn(Volts) -> Volts, per_volt: Ratio) {
        let duty = match drive {
            Drive::Off => return self.disable(),
            // Every phase at the same duty: zero volts across the motor. It
            // brakes with its own back-EMF, and the energy stays in the windings.
            Drive::Short => SHORTED,
            Drive::Volts(push) => svpwm::duties(Volts::ZERO, forward(push), electrical, per_volt),
            Drive::Field { volts, electrical } => svpwm::duties(volts, Volts::ZERO, electrical, per_volt),
        };
        if self.apply(duty).is_err() {
            self.disable();
        }
    }

    /// Show `duty` on the gates from the next PWM period. New duty cycles
    /// latch when the counter restarts, which is also when the tick runs.
    /// While disconnected, `disable` keeps the PWM at the shorted duty, so
    /// reconnecting at once shows zero volts for the rest of this period:
    /// never a stale drive.
    fn apply(&mut self, duty: [u16; 3]) -> Result<(), &'static str> {
        if EMERGENCY_STOP.load(Ordering::Acquire) {
            return Err("motor_emergency_stop");
        }
        self.write(duty);
        if !self.connected {
            critical_section::with(|_| {
                if EMERGENCY_STOP.load(Ordering::Acquire) {
                    return Err("motor_emergency_stop");
                }
                for (pin, route) in MOTOR_GATE_PINS.into_iter().zip(self.pwm_routes) {
                    // SAFETY: Restore only the six routes configured by our HAL
                    // instances; the latched emergency check is in this same CS.
                    GPIO::regs().func_out_sel_cfg(pin as usize).write(|w| unsafe { w.bits(route) });
                }
                self.connected = true;
                Ok(())
            })?;
        }
        Ok(())
    }

    fn write(&mut self, duty: [u16; 3]) {
        self.u.set_timestamp_a(duty[0]);
        self.v.set_timestamp_a(duty[1]);
        self.w.set_timestamp_a(duty[2]);
    }
}

impl Drop for Motor {
    fn drop(&mut self) {
        self.disable();
    }
}

fn configure_pair<const OP: u8>(pins: &mut LinkedPins<'static, MCPWM0<'static>, OP>) {
    pins.set_rising_edge_deadtime(DEADTIME_TICKS);
    pins.set_falling_edge_deadtime(DEADTIME_TICKS);
    pins.set_timestamp_a(SHORTED[0]);
    pins.set_deadtime_cfg(DeadTimeCfg::new_ahc());
}

fn force_generators_low(force: bool) {
    for operator in 0..3 {
        // SAFETY: During initialization only, before PWM is connected to live
        // gates. The PAC defines mode 1 as low and update method 0 as immediate.
        MCPWM0::regs().ch(operator).gen_force().write(|w| unsafe {
            w.cntuforce_upmethod().bits(0);
            w.a_cntuforce_mode().bits(u8::from(force));
            w.b_cntuforce_mode().bits(u8::from(force))
        });
    }
}

/// Acknowledge the PWM period interrupt. Returns false if it wasn't ours.
pub fn period_elapsed() -> bool {
    let regs = MCPWM0::regs();
    let ours = regs.int_st().read().timer0_tez().bit_is_set();
    regs.int_clr().write(|w| w.timer0_tez().clear_bit_by_one());
    ours
}
