//! Everything the knob computes, kept free of hardware so it runs in host tests.
#![no_std]

// Parsed commands hold their curve points on the heap; the tick never allocates.
extern crate alloc;

#[cfg(test)]
extern crate std;

pub mod alignment;
pub mod curves;
pub mod effects;
pub mod encoder;
pub mod flywheel;
pub mod motion;
pub mod output;
pub mod protocol;
pub mod safety;
pub mod svpwm;
pub mod tuning;
pub mod units;
#[cfg(test)]
mod vectors;

pub use curves::{Config, Curve, Feel, Feelings, Point};
pub use tuning::Tuning;
pub use protocol::{Command, Message};
