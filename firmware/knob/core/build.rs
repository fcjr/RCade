//! Turns `../tuning.toml` into integer constants: `Tuning::DEFAULT`,
//! `POLE_PAIRS` and `MAGNETS`. The firmware is integer-only, so every number
//! becomes the `_q16` bits of its value (16 fractional bits).

use std::{env, fs, path::Path};

/// The tuning fields, then `pole_pairs`, which isn't one.
const FIELDS: [&str; 16] = [
    "supply", "accel", "back_emf", "emf_cancel", "dead_time", "drag_coulomb", "drag_viscous",
    "coupling_stiffness", "coupling_damping", "mass", "tension", "friction", "drag_cancel",
    "rumble", "rumble_hz",
    "pole_pairs",
];

fn main() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tuning.toml");
    println!("cargo:rerun-if-changed={}", source.display());
    let text = fs::read_to_string(&source).expect("tuning.toml is readable");
    let table: toml::Table = text.parse().expect("tuning.toml is valid TOML");
    if let Some(unknown) = table.keys().find(|key| !FIELDS.contains(&key.as_str()) && *key != "magnets") {
        panic!("tuning.toml: unknown field `{unknown}`");
    }
    let number = |key: &str| match table.get(key) {
        Some(toml::Value::Float(value)) => *value,
        Some(toml::Value::Integer(value)) => *value as f64,
        _ => panic!("tuning.toml: `{key}` must be a number"),
    };
    let fields: String = FIELDS[..FIELDS.len() - 1].iter()
        .map(|key| format!("    {key}_q16: {},\n", (number(key) * 65_536.0).round() as i32))
        .collect();
    let magnets: String = match table.get("magnets") {
        None => String::new(),
        Some(toml::Value::Table(knobs)) => knobs.iter().map(|(id, magnet)| {
            let field = |key: &str| magnet.get(key).and_then(toml::Value::as_integer)
                .unwrap_or_else(|| panic!("tuning.toml: magnets.\"{id}\" needs an integer `{key}`"));
            let (direction, zero) = (field("direction"), field("zero"));
            assert!(matches!(direction, -1 | 1), "tuning.toml: magnets.\"{id}\".direction must be 1 or -1");
            assert!((0..65_536).contains(&zero), "tuning.toml: magnets.\"{id}\".zero must be 0 to 65535");
            format!("    ({id:?}, {direction}, {zero}),\n")
        }).collect(),
        Some(_) => panic!("tuning.toml: `magnets` must be a table"),
    };
    let code = format!(
        "/// Each known knob's magnets, from tuning.toml: (id, direction, zero).\n\
         pub const MAGNETS: &[(&str, i8, u16)] = &[\n{magnets}];\n\n\
         /// Magnet pole pairs, from tuning.toml.\npub const POLE_PAIRS: u8 = {};\n\n\
         impl Tuning {{\n    /// tuning.toml, as built into the firmware.\n    pub const DEFAULT: Tuning = Tuning {{\n{}    }};\n}}\n",
        number("pole_pairs") as u8,
        fields.replace("    ", "        "),
    );
    let out = Path::new(&env::var("OUT_DIR").unwrap()).join("tuning.rs");
    fs::write(out, code).unwrap();
}
