//! Checks that catch real failures. Any fault turns the gates off and returns
//! the knob to stock curves, which ask for exactly zero, so a reset can never
//! fault again on its own.
//!
//! There is deliberately no speed, slew or saturation limit: the motor cannot
//! pass its no-load speed, and may hold full voltage against a hand for as
//! long as a game likes. The only drive limit is the voltage ceiling.

/// The cabinet must be heard from this often, or the knob returns to stock.
pub const LEASE_US: u64 = 500_000;

/// Why the knob stopped driving.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Fault {
    /// The encoder's CRC failed: the angle can't be trusted.
    EncoderCrc,
    /// The encoder reports the magnet too weak or too strong.
    EncoderField,
    /// The TMC6300 raised DIAG: overcurrent, overheating or undervoltage.
    Driver,
    /// A tick ran late while driving, so the motor used a stale angle.
    MissedTick,
    /// The cabinet stopped sending leases.
    LeaseExpired,
}

impl Fault {
    pub fn name(self) -> &'static str {
        match self {
            Fault::EncoderCrc => "encoder_crc",
            Fault::EncoderField => "encoder_magnetic_field",
            Fault::Driver => "driver_fault",
            Fault::MissedTick => "missed_tick",
            Fault::LeaseExpired => "lease_expired",
        }
    }
}

#[derive(Default)]
pub struct Lease {
    until_us: u64,
}

impl Lease {
    pub fn renew(&mut self, now_us: u64) {
        self.until_us = now_us.saturating_add(LEASE_US);
    }

    pub fn alive(&self, now_us: u64) -> bool {
        now_us < self.until_us
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_lease_expires() {
        let mut lease = Lease::default();
        assert!(!lease.alive(0));
        lease.renew(0);
        assert!(lease.alive(LEASE_US - 1));
        assert!(!lease.alive(LEASE_US));
    }
}
