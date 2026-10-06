//! Rumble: a buzz on top of the curves. The same inputs and presets as
//! web-haptics' `trigger` (haptics.lochie.me; its
//! src/lib/web-haptics/{types,patterns}.ts), renamed: here "haptics" means
//! the curves.

/// One buzz.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Vibration {
    /// How long it buzzes, in ms. At most 1000, like web-haptics.
    pub duration: f64,
    /// 0..1. `None`: the rumble's `intensity` option.
    pub intensity: Option<f64>,
    /// A pause before it, in ms.
    pub delay: f64,
}

impl Vibration {
    /// A buzz of `duration` ms at the rumble's intensity, with no pause
    /// before it.
    pub const fn new(duration: f64) -> Self {
        Vibration { duration, intensity: None, delay: 0.0 }
    }

    pub const fn with_intensity(self, intensity: f64) -> Self {
        Vibration { intensity: Some(intensity), ..self }
    }

    pub const fn with_delay(self, delay: f64) -> Self {
        Vibration { delay, ..self }
    }
}

const fn buzz(delay: f64, duration: f64, intensity: f64) -> Vibration {
    Vibration { duration, intensity: Some(intensity), delay }
}

/// web-haptics' presets, as they are there.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum RumblePreset {
    // Notification (UINotificationFeedbackGenerator)
    Success,
    Warning,
    Error,
    // Impact (UIImpactFeedbackGenerator)
    Light,
    Medium,
    Heavy,
    Soft,
    Rigid,
    // Selection (UISelectionFeedbackGenerator)
    Selection,
    // Custom
    Nudge,
    Buzz,
}

const PRESETS: [(RumblePreset, &str, &[Vibration]); 11] = [
    (RumblePreset::Success, "success", &[buzz(0.0, 30.0, 0.5), buzz(60.0, 40.0, 1.0)]),
    (RumblePreset::Warning, "warning", &[buzz(0.0, 40.0, 0.8), buzz(100.0, 40.0, 0.6)]),
    (
        RumblePreset::Error,
        "error",
        &[buzz(0.0, 40.0, 0.7), buzz(40.0, 40.0, 0.7), buzz(40.0, 40.0, 0.9), buzz(40.0, 50.0, 0.6)],
    ),
    (RumblePreset::Light, "light", &[buzz(0.0, 15.0, 0.4)]),
    (RumblePreset::Medium, "medium", &[buzz(0.0, 25.0, 0.7)]),
    (RumblePreset::Heavy, "heavy", &[buzz(0.0, 35.0, 1.0)]),
    (RumblePreset::Soft, "soft", &[buzz(0.0, 40.0, 0.5)]),
    (RumblePreset::Rigid, "rigid", &[buzz(0.0, 10.0, 1.0)]),
    (RumblePreset::Selection, "selection", &[buzz(0.0, 8.0, 0.3)]),
    (RumblePreset::Nudge, "nudge", &[buzz(0.0, 80.0, 0.8), buzz(80.0, 50.0, 0.3)]),
    (RumblePreset::Buzz, "buzz", &[buzz(0.0, 1000.0, 1.0)]),
];

/// Every preset, in web-haptics' order.
pub fn rumble_presets() -> [RumblePreset; 11] {
    PRESETS.map(|(preset, ..)| preset)
}

impl RumblePreset {
    fn entry(self) -> &'static (RumblePreset, &'static str, &'static [Vibration]) {
        PRESETS.iter().find(|(preset, ..)| *preset == self).expect("every preset is listed")
    }

    /// Its web-haptics name, e.g. `"success"`.
    pub fn name(self) -> &'static str {
        self.entry().1
    }

    pub fn pattern(self) -> &'static [Vibration] {
        self.entry().2
    }

    /// The preset with this web-haptics name.
    pub fn from_name(name: &str) -> Option<RumblePreset> {
        PRESETS.iter().find(|(_, preset, _)| *preset == name).map(|(preset, ..)| *preset)
    }
}

/// `navigator.vibrate`-style on/off durations, or a list of vibrations.
#[derive(Clone, Debug, PartialEq)]
pub enum RumblePattern {
    /// On, off, on, …, in ms: each "off" is the next vibration's delay.
    OnOff(Vec<f64>),
    Vibrations(Vec<Vibration>),
}

/// A duration in ms, a preset (or its name), or a pattern. The default is
/// what web-haptics' `trigger()` plays with no input: 25 ms at 0.7.
#[derive(Clone, Debug, PartialEq)]
pub enum RumbleInput {
    Duration(f64),
    Preset(RumblePreset),
    /// A preset's web-haptics name: an unknown one plays nothing, with a
    /// warning.
    Name(String),
    Pattern(RumblePattern),
}

impl Default for RumbleInput {
    fn default() -> Self {
        RumbleInput::Pattern(RumblePattern::Vibrations(vec![Vibration::new(25.0).with_intensity(0.7)]))
    }
}

impl From<f64> for RumbleInput {
    fn from(duration: f64) -> Self {
        RumbleInput::Duration(duration)
    }
}

impl From<u32> for RumbleInput {
    fn from(duration: u32) -> Self {
        RumbleInput::Duration(duration as f64)
    }
}

impl From<RumblePreset> for RumbleInput {
    fn from(preset: RumblePreset) -> Self {
        RumbleInput::Preset(preset)
    }
}

impl From<&str> for RumbleInput {
    fn from(name: &str) -> Self {
        RumbleInput::Name(name.to_owned())
    }
}

impl From<String> for RumbleInput {
    fn from(name: String) -> Self {
        RumbleInput::Name(name)
    }
}

impl From<RumblePattern> for RumbleInput {
    fn from(pattern: RumblePattern) -> Self {
        RumbleInput::Pattern(pattern)
    }
}

impl From<Vec<f64>> for RumbleInput {
    fn from(durations: Vec<f64>) -> Self {
        RumbleInput::Pattern(RumblePattern::OnOff(durations))
    }
}

impl From<&[f64]> for RumbleInput {
    fn from(durations: &[f64]) -> Self {
        durations.to_vec().into()
    }
}

impl<const N: usize> From<[f64; N]> for RumbleInput {
    fn from(durations: [f64; N]) -> Self {
        durations.to_vec().into()
    }
}

impl<const N: usize> From<[u32; N]> for RumbleInput {
    fn from(durations: [u32; N]) -> Self {
        durations.map(f64::from).to_vec().into()
    }
}

impl From<Vec<Vibration>> for RumbleInput {
    fn from(vibrations: Vec<Vibration>) -> Self {
        RumbleInput::Pattern(RumblePattern::Vibrations(vibrations))
    }
}

impl From<&[Vibration]> for RumbleInput {
    fn from(vibrations: &[Vibration]) -> Self {
        vibrations.to_vec().into()
    }
}

impl<const N: usize> From<[Vibration; N]> for RumbleInput {
    fn from(vibrations: [Vibration; N]) -> Self {
        vibrations.to_vec().into()
    }
}

/// Options for a rumble.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct RumbleOptions {
    /// The intensity of vibrations that don't set their own, 0..1. Default 0.5.
    pub intensity: f64,
}

impl Default for RumbleOptions {
    fn default() -> Self {
        RumbleOptions { intensity: 0.5 }
    }
}

impl RumbleOptions {
    /// Vibrations that don't set their own intensity get `intensity`.
    pub fn intensity(intensity: f64) -> Self {
        RumbleOptions { intensity }
    }
}

/// Logged, never thrown: a bad rumble mid-game plays nothing.
pub(crate) fn warn(message: &str) {
    let message = format!("[input-spinners] {message}");
    #[cfg(target_arch = "wasm32")]
    web_sys::console::warn_1(&message.into());
    #[cfg(not(target_arch = "wasm32"))]
    eprintln!("{message}");
}

/// Any input as plain vibrations, or `None` (with a warning) for an unknown
/// preset name.
pub fn vibrations(input: &RumbleInput) -> Option<Vec<Vibration>> {
    Some(match input {
        RumbleInput::Duration(duration) => vec![Vibration::new(*duration)],
        RumbleInput::Preset(preset) => preset.pattern().to_vec(),
        RumbleInput::Name(name) => match RumblePreset::from_name(name) {
            Some(preset) => preset.pattern().to_vec(),
            None => {
                warn(&format!("Unknown rumble preset: \"{name}\""));
                return None;
            }
        },
        RumbleInput::Pattern(RumblePattern::OnOff(durations)) => durations
            .iter()
            .enumerate()
            .step_by(2)
            .map(|(i, &duration)| {
                let delay = if i > 0 { durations[i - 1] } else { 0.0 };
                Vibration::new(duration).with_delay(if delay > 0.0 { delay } else { 0.0 })
            })
            .collect(),
        RumbleInput::Pattern(RumblePattern::Vibrations(list)) => list.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presets_by_name() {
        assert_eq!(RumblePreset::from_name("heavy"), Some(RumblePreset::Heavy));
        assert_eq!(RumblePreset::Heavy.name(), "heavy");
        assert_eq!(RumblePreset::from_name("nope"), None);
        for preset in rumble_presets() {
            assert_eq!(RumblePreset::from_name(preset.name()), Some(preset));
        }
        assert_eq!(vibrations(&"nope".into()), None);
    }

    #[test]
    fn on_off_durations() {
        let list = vibrations(&[100.0, 50.0, 100.0, 20.0].into()).unwrap();
        assert_eq!(list, vec![Vibration::new(100.0), Vibration::new(100.0).with_delay(50.0)]);
        assert_eq!(vibrations(&Vec::<f64>::new().into()), Some(vec![]));
    }
}
