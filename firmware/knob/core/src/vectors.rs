//! Shared test vectors: curves and the exact values the knob computes for
//! them. The TypeScript and Rust clients check their own maths against
//! `vectors.json`, so a curve drawn in the toy is the curve the knob feels.
//!
//! Regenerate after an intentional change with
//! `cargo test -p rcade-haptics-core -- --ignored write_vectors`.

use crate::curves::TURN;
use crate::units::{from_units, to_units};
use crate::{Curve, Point};
use serde::{Deserialize, Serialize};
use std::{string::String, vec::Vec};

const PATH: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/vectors.json");

#[derive(Debug, Deserialize, Serialize, PartialEq)]
struct Case {
    name: String,
    curve: Curve,
    /// `[global angle, value]` pairs, both in 1/65536 turn, value rounded down.
    samples: Vec<[i64; 2]>,
}

fn point(x: i64, y: i64, incoming: Option<i64>, outgoing: Option<i64>) -> Point {
    Point { x, y, incoming, outgoing }
}

fn cases() -> Vec<Case> {
    let curves = [
        ("one point", false, false, std::vec![point(0, 32_768, None, None)]),
        ("linear, repeating", false, false, std::vec![point(10_000, 0, None, None), point(50_000, 60_000, None, None), point(75_536, 0, None, None)]),
        ("jump over three turns", false, false, std::vec![point(1_000, 200, None, None), point(100_000, 200, None, None), point(100_000, 65_535, None, None), point(197_608, 65_535, None, None)]),
        ("bezier handles", false, false, std::vec![point(-4_000, 5_000, None, Some(65_535)), point(20_000, 60_000, None, None), point(40_000, 20_000, Some(0), None)]),
        ("wall on the left", false, true, std::vec![point(0, 65_535, None, None), point(0, 0, None, None), point(30_000, 40_000, None, None), point(65_536, 0, None, None)]),
        ("flat both ends", true, true, std::vec![point(-20_000, 100, None, None), point(20_000, 60_000, Some(0), None)]),
    ];
    curves.into_iter().map(|(name, flat_after, flat_before, points)| {
        let curve = Curve { points: points.into_iter().collect(), flat_before, flat_after };
        let baked = curve.bake();
        let samples = (-4 * TURN..4 * TURN).step_by(9_973)
            .map(|x| [x, to_units(baked.at(from_units(x)).0)])
            .collect();
        Case { name: name.into(), curve, samples }
    }).collect()
}

#[test]
fn the_knob_matches_the_shared_vectors() {
    let stored: Vec<Case> = serde_json::from_str(&std::fs::read_to_string(PATH).unwrap()).unwrap();
    assert_eq!(stored, cases(), "the curve maths changed; regenerate vectors.json if intended");
}

#[test]
#[ignore = "writes vectors.json"]
fn write_vectors() {
    std::fs::write(PATH, serde_json::to_string_pretty(&cases()).unwrap() + "\n").unwrap();
}
