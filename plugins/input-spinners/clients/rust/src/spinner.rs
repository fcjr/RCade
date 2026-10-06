//! The two knobs, over one plugin channel shared by both and acquired on
//! first use. Everything here runs on the page's (or worker's) one thread.

// Outside a browser no message ever arrives: the receiving side is unused.
#![cfg_attr(not(any(test, target_arch = "wasm32")), allow(dead_code))]

use std::cell::RefCell;
use std::collections::BTreeMap;
use std::fmt;
use std::future::Future;
use std::pin::Pin;
use std::rc::Rc;
use std::task::{Context, Poll, Waker};

use crate::curve::{Curves, repeat_degrees};
use crate::rumble::{RumbleInput, RumbleOptions};
use crate::wire::{Player, WireCommand, WireCommandBody, WireConfig, WireMessage, curves_to_wire, pulses_to_wire};
use crate::{Error, degrees_to_units, units_to_degrees};

#[cfg(target_arch = "wasm32")]
use crate::js::Timer;

/// Outside a browser there are no timers (and no knob to wait for).
#[cfg(not(target_arch = "wasm32"))]
#[allow(dead_code)]
struct Timer;

/// Angles are where the curves are read: detents click at them.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpinnerState {
    /// Wrapped angle in degrees, [0, 360).
    pub angle: f64,
    /// Total angle in degrees, keeps counting across turns.
    pub global_angle: f64,
    /// Where the hand is: leads `global_angle` while pushing against a curve.
    pub raw_angle: f64,
}

/// One movement of a knob.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SpinnerEvent {
    /// Wrapped angle in degrees, [0, 360).
    pub angle: f64,
    /// Total angle in degrees, keeps counting across turns.
    pub global_angle: f64,
    /// Where the hand is (see [`SpinnerState`]).
    pub raw_angle: f64,
    /// Signed change in degrees since the last event.
    pub delta_angle: f64,
    /// Milliseconds since the last event, on the knob's clock.
    pub delta_time: f64,
    /// Degrees per second.
    pub velocity: f64,
}

// ─── Ack: a command's answer ─────────────────────────────────────

#[derive(Default)]
struct Slot {
    result: Option<Result<(), Error>>,
    waker: Option<Waker>,
}

fn settle_slot(slot: &RefCell<Slot>, result: Result<(), Error>) {
    let waker = {
        let mut slot = slot.borrow_mut();
        slot.result = Some(result);
        slot.waker.take()
    };
    if let Some(waker) = waker {
        waker.wake();
    }
}

/// A command's answer: resolves when the knob confirms it, or fails if it
/// refuses, isn't connected, or doesn't answer within 2 s.
///
/// The command is sent when it's made, not when this is awaited: dropping
/// an `Ack` only stops you hearing the answer.
pub struct Ack {
    slot: Rc<RefCell<Slot>>,
}

impl Ack {
    fn pending() -> (Ack, Rc<RefCell<Slot>>) {
        let slot = Rc::new(RefCell::new(Slot::default()));
        (Ack { slot: slot.clone() }, slot)
    }

    fn ready(result: Result<(), Error>) -> Ack {
        let (ack, slot) = Ack::pending();
        settle_slot(&slot, result);
        ack
    }
}

impl Future for Ack {
    type Output = Result<(), Error>;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        let mut slot = self.slot.borrow_mut();
        match slot.result.take() {
            Some(result) => Poll::Ready(result),
            None => {
                slot.waker = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
}

impl fmt::Debug for Ack {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Ack").field("result", &self.slot.borrow().result).finish()
    }
}

// ─── One knob's state ────────────────────────────────────────────

type Listener = Rc<RefCell<dyn FnMut(SpinnerEvent)>>;

struct Pending {
    kind: &'static str,
    slot: Rc<RefCell<Slot>>,
    /// Cleared when dropped.
    #[allow(dead_code)]
    timer: Option<Timer>,
}

struct Core {
    player: Player,
    /// The knob is plugged in and has said hello.
    connected: bool,
    /// The knob's ID (its MAC), once connected.
    device_id: String,
    global_units: i64,
    raw_units: i64,
    velocity_units: i64,
    /// The knob's clock at the last event, µs.
    event_us: Option<u64>,
    /// The next tick only says where the knob is now: it didn't turn there.
    rebase: bool,
    /// Unacked tares by id, and how far each shifts the angles. Ticks sent
    /// before them get shifted; `None` (no reference) skips them.
    tares: BTreeMap<u64, Option<i64>>,
    listeners: Vec<(u64, Listener)>,
    pending: BTreeMap<u64, Pending>,
    /// The game's latest curves: sent again whenever the knob (re)connects.
    curves: Option<WireConfig>,
}

impl Core {
    fn new(player: Player) -> Core {
        Core {
            player,
            connected: false,
            device_id: String::new(),
            global_units: 0,
            raw_units: 0,
            velocity_units: 0,
            event_us: None,
            rebase: true,
            tares: BTreeMap::new(),
            listeners: Vec::new(),
            pending: BTreeMap::new(),
            curves: None,
        }
    }

    fn state(&self) -> SpinnerState {
        let global_angle = units_to_degrees(self.global_units);
        SpinnerState { angle: repeat_degrees(global_angle), global_angle, raw_angle: units_to_degrees(self.raw_units) }
    }

    fn settle(&mut self, id: Option<u64>, command: &str, error: Option<&str>) {
        let Some(id) = id else { return };
        // Configs apply in order, and the cabinet drops a queued config when
        // a newer one replaces it: a config's ack answers every config sent
        // before it.
        let answered: Vec<u64> = self
            .pending
            .iter()
            .filter(|&(&key, pending)| {
                key == id || (error.is_none() && command == "config" && pending.kind == "config" && key < id)
            })
            .map(|(&key, _)| key)
            .collect();
        for key in answered {
            let Some(pending) = self.pending.remove(&key) else { continue };
            let shift = self.tares.remove(&key).flatten();
            match error {
                Some(message) => {
                    // A tare that failed didn't move anything.
                    self.global_units -= shift.unwrap_or(0);
                    self.raw_units -= shift.unwrap_or(0);
                    settle_slot(&pending.slot, Err(Error::Knob(message.to_owned())));
                }
                None => settle_slot(&pending.slot, Ok(())),
            }
        }
    }

    fn timed_out(&mut self, id: u64) {
        self.tares.remove(&id);
        if let Some(pending) = self.pending.remove(&id) {
            settle_slot(&pending.slot, Err(Error::Timeout { command: pending.kind }));
        }
    }

    /// Take in one message: maybe a command to send back, maybe an event.
    fn receive(&mut self, message: &WireMessage, next_id: &mut u64) -> (Option<WireCommand>, Option<SpinnerEvent>) {
        match message {
            WireMessage::Hello { id, .. } => {
                self.connected = true;
                self.device_id = id.clone();
                // A new connection or a restarted knob: its angle jumps
                // without turning, and it holds stock curves.
                self.rebase = true;
                self.tares.clear();
                let config = self.curves.clone().map(|config| WireCommand {
                    player: self.player,
                    id: Some(take_id(next_id)),
                    body: WireCommandBody::Config { config },
                });
                (config, None)
            }
            WireMessage::Connection { connected, .. } => {
                self.connected = *connected && self.connected;
                if !connected {
                    self.device_id.clear();
                }
                (None, None)
            }
            &WireMessage::Tick { global_angle, curve_angle, velocity_q16, time_us, .. } => {
                let Some(shift) = self.tares.values().try_fold(0, |sum, tare| tare.map(|shift| sum + shift)) else {
                    return (None, None);
                };
                let (curve, raw) = (curve_angle + shift, global_angle + shift);
                let moved = (curve != self.global_units || raw != self.raw_units) && !self.rebase;
                let delta_angle = units_to_degrees(curve - self.global_units);
                self.global_units = curve;
                self.raw_units = raw;
                self.velocity_units = velocity_q16;
                if self.rebase {
                    self.event_us = None;
                }
                self.rebase = false;
                if !moved {
                    return (None, None);
                }
                let delta_time = self.event_us.map_or(0.0, |event_us| (time_us as f64 - event_us as f64) / 1000.0);
                self.event_us = Some(time_us);
                let SpinnerState { angle, global_angle, raw_angle } = self.state();
                let velocity = units_to_degrees(self.velocity_units);
                (None, Some(SpinnerEvent { angle, global_angle, raw_angle, delta_angle, delta_time, velocity }))
            }
            WireMessage::Ack { id, command, .. } => {
                self.settle(*id, command, None);
                (None, None)
            }
            WireMessage::Error { id, message, .. } => {
                self.settle(*id, "", Some(message));
                (None, None)
            }
            WireMessage::Status { .. } | WireMessage::Other => (None, None),
        }
    }
}

fn take_id(next_id: &mut u64) -> u64 {
    let id = *next_id;
    *next_id += 1;
    id
}

// ─── The channel, shared by both knobs ───────────────────────────

struct Link {
    cores: [Core; 2],
    next_id: u64,
    next_listener: u64,
    #[cfg(target_arch = "wasm32")]
    js: crate::js::Channel,
    /// Every command sent, for the tests.
    #[cfg(test)]
    sent: Vec<WireCommand>,
}

impl Link {
    fn new() -> Link {
        Link {
            cores: [Core::new(Player::One), Core::new(Player::Two)],
            next_id: 1,
            next_listener: 1,
            #[cfg(target_arch = "wasm32")]
            js: crate::js::Channel::default(),
            #[cfg(test)]
            sent: Vec::new(),
        }
    }

    fn core(&mut self, player: Player) -> &mut Core {
        &mut self.cores[player.index()]
    }

    /// Acquire the channel if nobody has yet. Outside the cabinet this never
    /// finishes, and the spinners stay still.
    fn start(&mut self) {
        #[cfg(target_arch = "wasm32")]
        self.js.start();
    }

    fn id(&mut self) -> u64 {
        take_id(&mut self.next_id)
    }

    fn post(&mut self, command: WireCommand) {
        self.start();
        #[cfg(target_arch = "wasm32")]
        self.js.post(&command);
        #[cfg(test)]
        self.sent.push(command);
        #[cfg(not(any(test, target_arch = "wasm32")))]
        drop(command);
    }

    /// Wait for the answer to command `id`, failing after 2 s if `timed`.
    fn wait(&mut self, player: Player, id: u64, kind: &'static str, timed: bool) -> Ack {
        let (ack, slot) = Ack::pending();
        #[cfg(target_arch = "wasm32")]
        let timer = timed.then(|| self.js.timer(player, id));
        #[cfg(not(target_arch = "wasm32"))]
        let timer = {
            let _ = timed;
            None
        };
        self.core(player).pending.insert(id, Pending { kind, slot, timer });
        ack
    }

    fn command(&mut self, player: Player, body: WireCommandBody) -> Ack {
        self.command_then(player, body, |_, _| {})
    }

    /// `sent` runs as the command goes out, before anything else arrives.
    fn command_then(&mut self, player: Player, body: WireCommandBody, sent: impl FnOnce(&mut Core, u64)) -> Ack {
        self.start();
        if !self.core(player).connected {
            return Ack::ready(Err(Error::NotConnected(player)));
        }
        let id = self.id();
        let ack = self.wait(player, id, body.kind(), true);
        self.post(WireCommand { player, id: Some(id), body });
        sent(self.core(player), id);
        ack
    }

    /// Take in one message; the events it makes, with who to tell.
    fn receive(&mut self, message: WireMessage) -> Vec<(Vec<Listener>, SpinnerEvent)> {
        let players = match message.player() {
            Some(player) => vec![player],
            None => vec![Player::One, Player::Two],
        };
        let mut deliveries = Vec::new();
        for player in players {
            let core = &mut self.cores[player.index()];
            let (reply, event) = core.receive(&message, &mut self.next_id);
            if let Some(event) = event {
                deliveries.push((core.listeners.iter().map(|(_, listener)| listener.clone()).collect(), event));
            }
            if let Some(reply) = reply {
                self.post(reply);
            }
        }
        deliveries
    }
}

thread_local! {
    static LINK: RefCell<Link> = RefCell::new(Link::new());
}

fn with_link<R>(f: impl FnOnce(&mut Link) -> R) -> R {
    LINK.with(|link| f(&mut link.borrow_mut()))
}

/// The channel is open: say hello for both knobs.
#[cfg(target_arch = "wasm32")]
pub(crate) fn opened(port: web_sys::MessagePort) {
    with_link(|link| {
        link.js.open(port);
        for player in [Player::One, Player::Two] {
            link.post(WireCommand { player, id: None, body: WireCommandBody::Hello });
        }
    });
}

/// One message from the cabinet. Listeners are called after the state is
/// released, so they may use the spinners freely.
pub(crate) fn dispatch(message: WireMessage) {
    let deliveries = with_link(|link| link.receive(message));
    for (listeners, event) in deliveries {
        for listener in listeners {
            if let Ok(mut listener) = listener.try_borrow_mut() {
                (*listener)(event);
            }
        }
    }
}

/// A command's 2 s are up.
#[cfg_attr(not(any(test, target_arch = "wasm32")), allow(dead_code))]
pub(crate) fn timed_out(player: Player, id: u64) {
    with_link(|link| link.core(player).timed_out(id));
}

// ─── Spinner ─────────────────────────────────────────────────────

/// One T-Knob: a cheap handle, [`P1`] or [`P2`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Spinner {
    player: Player,
}

/// Player 1's knob.
pub const P1: Spinner = Spinner { player: Player::One };
/// Player 2's knob.
pub const P2: Spinner = Spinner { player: Player::Two };

/// A player's knob: [`P1`] or [`P2`].
pub const fn spinner(player: Player) -> Spinner {
    Spinner { player }
}

impl Spinner {
    pub const fn player(&self) -> Player {
        self.player
    }

    /// Where the knob is now.
    pub fn read(&self) -> SpinnerState {
        with_link(|link| {
            link.start();
            link.core(self.player).state()
        })
    }

    /// The knob is plugged in and has said hello.
    pub fn connected(&self) -> bool {
        with_link(|link| {
            link.start();
            link.core(self.player).connected
        })
    }

    /// The knob's ID (its MAC), once connected; empty before.
    pub fn device_id(&self) -> String {
        with_link(|link| link.core(self.player).device_id.clone())
    }

    /// Calls `listener` with every movement, until the returned
    /// [`Subscription`] is dropped.
    pub fn subscribe(&self, listener: impl FnMut(SpinnerEvent) + 'static) -> Subscription {
        let listener: Listener = Rc::new(RefCell::new(listener));
        let id = with_link(|link| {
            link.start();
            let id = link.next_listener;
            link.next_listener += 1;
            link.core(self.player).listeners.push((id, listener));
            id
        });
        Subscription { player: self.player, id: Some(id) }
    }

    /// Buzz the knob, on top of its curves, if it's connected. The same
    /// inputs and presets as web-haptics' `trigger` (haptics.lochie.me):
    /// `RumbleInput::default()` is its no-input tap. A new rumble replaces
    /// one that's playing. A bad input logs a warning and plays nothing.
    pub fn rumble(&self, input: impl Into<RumbleInput>, options: RumbleOptions) {
        let Some(pulses) = pulses_to_wire(input, options) else { return };
        with_link(|link| {
            if link.core(self.player).connected {
                link.post(WireCommand { player: self.player, id: None, body: WireCommandBody::Rumble { pulses } });
            }
        });
    }

    /// Sets `angle` and `global_angle` to `angle` (degrees; 0 makes where
    /// the knob is now 0).
    ///
    /// Sends the current reading with it, at once. The knob compares that
    /// with where it is now, so turning that happens while the message is in
    /// transit isn't lost. Before the first reading since the knob said
    /// hello, the knob takes where it is.
    ///
    /// Resolves when the knob confirms the tare.
    pub fn tare(&self, angle: f64) -> Ack {
        with_link(|link| {
            let core = link.core(self.player);
            let reference = (!core.rebase).then_some(core.raw_units);
            let units = degrees_to_units(angle);
            // The knob tares the hand's angle; the curve angle follows.
            let raw = reference.map_or(units, |_| units + core.raw_units - core.global_units);
            link.command_then(self.player, WireCommandBody::Tare { reference, global_angle: raw }, |core, id| {
                core.tares.insert(id, reference.map(|reference| raw - reference));
                core.global_units = units;
                core.raw_units = raw;
            })
        })
    }

    /// Replace all four curves. Resolves once the knob uses them. The curves
    /// are kept: if the knob reconnects, they're sent again. If the knob
    /// isn't connected yet, they're sent when it connects.
    pub fn set_curves(&self, curves: &Curves) -> Ack {
        let config = match curves_to_wire(curves) {
            Ok(config) => config,
            Err(error) => return Ack::ready(Err(error)),
        };
        with_link(|link| {
            link.start();
            link.core(self.player).curves = Some(config.clone());
            if !link.core(self.player).connected {
                // Sent when the knob connects; resolved by that config's ack.
                let id = link.id();
                return link.wait(self.player, id, "config", false);
            }
            link.command(self.player, WireCommandBody::Config { config })
        })
    }

    /// Back to the stock feel, as if the motor were off. Stops any rumble.
    pub fn reset(&self) -> Ack {
        with_link(|link| {
            link.core(self.player).curves = None;
            link.command(self.player, WireCommandBody::Reset)
        })
    }

    /// Stop the knob spinning. The curves stay.
    pub fn brake(&self) -> Ack {
        with_link(|link| link.command(self.player, WireCommandBody::Brake))
    }
}

/// A [`Spinner::subscribe`] listener. Dropping it (or calling
/// [`unsubscribe`](Subscription::unsubscribe)) stops the calls.
#[must_use = "dropping a Subscription unsubscribes at once; keep it, or call .forget()"]
#[derive(Debug)]
pub struct Subscription {
    player: Player,
    id: Option<u64>,
}

impl Subscription {
    /// Stop the calls.
    pub fn unsubscribe(self) {}

    /// Keep the listener for as long as the page runs.
    pub fn forget(mut self) {
        self.id = None;
    }
}

impl Drop for Subscription {
    fn drop(&mut self) {
        let Some(id) = self.id else { return };
        // The listener is dropped after the state is released: it may own
        // other subscriptions.
        let removed = LINK
            .try_with(|link| {
                let mut link = link.try_borrow_mut().ok()?;
                let listeners = &mut link.core(self.player).listeners;
                let index = listeners.iter().position(|(key, _)| *key == id)?;
                Some(listeners.remove(index))
            })
            .ok()
            .flatten();
        drop(removed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wire::WireSetting;
    use serde_json::json;
    use std::task::Waker;

    fn fresh() {
        LINK.with(|link| *link.borrow_mut() = Link::new());
    }

    fn send(message: serde_json::Value) {
        dispatch(serde_json::from_value(message).unwrap());
    }

    fn sent() -> Vec<serde_json::Value> {
        with_link(|link| link.sent.drain(..).map(|command| serde_json::to_value(command).unwrap()).collect())
    }

    fn poll(ack: &mut Ack) -> Poll<Result<(), Error>> {
        Pin::new(ack).poll(&mut Context::from_waker(Waker::noop()))
    }

    fn hello(player: u8) {
        send(json!({ "type": "hello", "player": player, "device": "rcade-tknob", "id": "aa:bb", "magnet": null, "max_points": 128 }));
    }

    fn tick(player: u8, global_angle: i64, time_us: u64) {
        tick_felt(player, global_angle, global_angle, time_us);
    }

    fn tick_felt(player: u8, global_angle: i64, curve_angle: i64, time_us: u64) {
        send(json!({ "type": "tick", "player": player, "angle": 0, "global_angle": global_angle, "curve_angle": curve_angle, "velocity_q16": 65536, "time_us": time_us }));
    }

    #[test]
    fn the_first_tick_after_hello_only_rebases() {
        fresh();
        let events = Rc::new(RefCell::new(Vec::new()));
        let seen = events.clone();
        let subscription = P1.subscribe(move |event| seen.borrow_mut().push(event));
        assert!(!P1.connected());
        hello(1);
        assert!(P1.connected() && !P2.connected());
        assert_eq!(P1.device_id(), "aa:bb");
        tick(1, 65_536 * 3, 1_000);
        assert!(events.borrow().is_empty(), "no event for the rebase");
        assert_eq!(P1.read(), SpinnerState { angle: 0.0, global_angle: 1080.0, raw_angle: 1080.0 });
        tick(1, 65_536 * 3 + 16_384, 11_000);
        tick(1, 65_536 * 3 + 16_384, 21_000); // didn't move: no event
        tick(1, 65_536 * 3 - 16_384, 31_000);
        assert_eq!(
            *events.borrow(),
            vec![
                SpinnerEvent { angle: 90.0, global_angle: 1170.0, raw_angle: 1170.0, delta_angle: 90.0, delta_time: 0.0, velocity: 360.0 },
                SpinnerEvent { angle: 270.0, global_angle: 990.0, raw_angle: 990.0, delta_angle: -180.0, delta_time: 20.0, velocity: 360.0 },
            ]
        );
        // Another hello: the knob's angle jumps without turning.
        hello(1);
        tick(1, 5, 41_000);
        assert_eq!(events.borrow().len(), 2);
        drop(subscription);
        tick(1, 500, 51_000);
        assert_eq!(events.borrow().len(), 2, "unsubscribed");
    }

    #[test]
    fn commands_need_a_connected_knob() {
        fresh();
        let mut ack = P2.brake();
        assert_eq!(poll(&mut ack), Poll::Ready(Err(Error::NotConnected(Player::Two))));
        P2.rumble(200, RumbleOptions::default());
        assert!(sent().is_empty());
        hello(2);
        P2.rumble(200, RumbleOptions::intensity(1.0));
        P2.rumble("nope", RumbleOptions::default());
        assert_eq!(
            sent(),
            vec![json!({ "player": 2, "type": "rumble", "pulses": [{ "delay_ms": 0, "duration_ms": 200, "intensity": 65535 }] })]
        );
        send(json!({ "type": "connection", "player": 2, "connected": false, "message": "unplugged" }));
        assert!(!P2.connected());
        assert_eq!(P2.device_id(), "");
    }

    #[test]
    fn acks_and_errors_settle_by_id() {
        fresh();
        hello(1);
        let mut brake = P1.brake();
        let mut reset = P1.reset();
        let sent = sent();
        assert_eq!(sent, vec![json!({ "player": 1, "id": 1, "type": "brake" }), json!({ "player": 1, "id": 2, "type": "reset" })]);
        assert_eq!(poll(&mut brake), Poll::Pending);
        send(json!({ "type": "error", "player": 1, "message": "busy", "id": 2 }));
        assert_eq!(poll(&mut reset), Poll::Ready(Err(Error::Knob("busy".into()))));
        assert_eq!(poll(&mut brake), Poll::Pending);
        send(json!({ "type": "ack", "player": 1, "command": "brake", "id": 1, "time_us": 5 }));
        assert_eq!(poll(&mut brake), Poll::Ready(Ok(())));
        let mut late = P1.brake();
        timed_out(Player::One, 3);
        assert_eq!(poll(&mut late), Poll::Ready(Err(Error::Timeout { command: "brake" })));
    }

    #[test]
    fn tare_sends_the_last_reading() {
        fresh();
        hello(1);
        tick(1, 1_000, 0);
        let mut tare = P1.tare(90.0);
        assert_eq!(
            sent(),
            vec![json!({ "player": 1, "id": 1, "type": "tare", "reference": 1000, "global_angle": 16384 })]
        );
        send(json!({ "type": "ack", "player": 1, "command": "tare", "id": 1, "time_us": 5 }));
        assert_eq!(poll(&mut tare), Poll::Ready(Ok(())));
        assert_eq!(P1.read().global_angle, 90.0);
    }

    #[test]
    fn ticks_sent_before_a_tare_landed_count_in_its_frame() {
        fresh();
        hello(1);
        tick(1, 1_000, 0);
        let events = Rc::new(RefCell::new(Vec::new()));
        let seen = events.clone();
        let _subscription = P1.subscribe(move |event| seen.borrow_mut().push(event.global_angle));
        let _tare = P1.tare(90.0);
        sent();
        tick(1, 1_100, 10_000);
        send(json!({ "type": "ack", "player": 1, "command": "tare", "id": 1, "time_us": 15_000 }));
        tick(1, 16_384 + 200, 20_000);
        let unit = 360.0 / 65_536.0;
        assert_eq!(*events.borrow(), vec![(16_384.0 + 100.0) * unit, (16_384.0 + 200.0) * unit]);
    }

    #[test]
    fn angles_are_where_the_curves_are_and_raw_is_the_hand() {
        fresh();
        hello(1);
        tick_felt(1, 0, 0, 0);
        let events = Rc::new(RefCell::new(Vec::new()));
        let seen = events.clone();
        let _subscription = P1.subscribe(move |event| seen.borrow_mut().push(event));
        let degree = 65_536 / 360;
        tick_felt(1, 6 * degree, degree, 10_000);
        let event = events.borrow()[0];
        assert_eq!((event.global_angle, event.delta_angle), (units_to_degrees(degree), units_to_degrees(degree)));
        assert_eq!(event.raw_angle, units_to_degrees(6 * degree));
        let _tare = P1.tare(90.0);
        assert_eq!(
            sent(),
            vec![json!({ "player": 1, "id": 1, "type": "tare", "reference": 6 * degree, "global_angle": 16_384 + 5 * degree })]
        );
        assert_eq!(P1.read().global_angle, 90.0);
    }

    #[test]
    fn a_tare_before_any_reading_lets_the_knob_use_where_it_is() {
        fresh();
        hello(1);
        let mut tare = P1.tare(30.0);
        assert_eq!(sent(), vec![json!({ "player": 1, "id": 1, "type": "tare", "global_angle": 5461 })]);
        tick(1, 777_777, 0);
        assert_eq!(P1.read().global_angle, 5461.0 * 360.0 / 65_536.0);
        send(json!({ "type": "ack", "player": 1, "command": "tare", "id": 1, "time_us": 5 }));
        assert_eq!(poll(&mut tare), Poll::Ready(Ok(())));
        tick(1, 5_500, 10_000);
        assert_eq!(P1.read().global_angle, 5_500.0 * 360.0 / 65_536.0);
    }

    #[test]
    fn curves_wait_for_the_knob_and_follow_it() {
        fresh();
        let curves = Curves::create().mass(1.0);
        let mut early = P1.set_curves(&curves);
        let mut earlier = P1.set_curves(&Curves::create().mass(0.5));
        assert!(sent().is_empty());
        hello(1);
        let config = sent();
        assert_eq!(config.len(), 1);
        assert_eq!(config[0]["type"], "config");
        assert_eq!(config[0]["id"], 3);
        assert_eq!(config[0]["config"]["mass"], json!(32768), "the latest curves");
        assert_eq!(poll(&mut early), Poll::Pending);
        // That config's ack answers every config before it.
        send(json!({ "type": "ack", "player": 1, "command": "config", "id": 3, "time_us": 5 }));
        assert_eq!(poll(&mut early), Poll::Ready(Ok(())));
        assert_eq!(poll(&mut earlier), Poll::Ready(Ok(())));
        // Connected: sent at once, and again when the knob says hello again.
        drop(P1.set_curves(&curves));
        let config = sent();
        assert_eq!(config[0]["mass"], serde_json::Value::Null);
        assert_eq!(config[0]["config"]["mass"], json!(65535));
        hello(1);
        let again = sent();
        assert_eq!(again[0]["config"], config[0]["config"]);
        assert_ne!(again[0]["id"], config[0]["id"]);
        // reset forgets them.
        drop(P1.reset());
        sent();
        hello(1);
        assert!(sent().is_empty());
        let wire = curves_to_wire(&curves).unwrap();
        assert_eq!(wire.mass, WireSetting::Value(65_535));
    }

    #[test]
    fn listeners_may_use_the_spinners() {
        fresh();
        hello(1);
        let reads = Rc::new(RefCell::new(Vec::new()));
        let seen = reads.clone();
        P1.subscribe(move |_| {
            seen.borrow_mut().push(P1.read().global_angle);
            drop(P1.brake());
        })
        .forget();
        tick(1, 0, 0);
        tick(1, 16_384, 10_000);
        assert_eq!(*reads.borrow(), vec![90.0]);
        assert_eq!(sent().len(), 1);
    }
}
