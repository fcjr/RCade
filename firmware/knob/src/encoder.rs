use esp_hal::{
    Blocking,
    gpio::{Level, Output, OutputConfig},
    peripherals::{GPIO7, GPIO14, GPIO15, SPI2},
    spi::{
        Mode,
        master::{Config, Spi},
    },
    time::Rate,
};

use rcade_haptics_core::safety::Fault;

/// The MT6701 clocks SSI up to 15.6 MHz (64 ns period); a 24-bit frame takes 2 µs.
const ENCODER_MHZ: u32 = 12;

/// MT6701's 24-bit SSI frame, including status and CRC rather than just angle.
pub struct Encoder {
    spi: Spi<'static, Blocking>,
    chip_select: Output<'static>,
}

impl Encoder {
    pub fn new(
        peripheral: SPI2<'static>,
        clock: GPIO14<'static>,
        data: GPIO15<'static>,
        chip_select: GPIO7<'static>,
    ) -> Self {
        let chip_select = Output::new(chip_select, Level::High, OutputConfig::default());
        let config = Config::default()
            .with_frequency(Rate::from_mhz(ENCODER_MHZ))
            .with_mode(Mode::_1);
        let spi = Spi::new(peripheral, config)
            .expect("fixed MT6701 SPI configuration is valid")
            .with_sck(clock)
            .with_miso(data);
        Self { spi, chip_select }
    }

    /// The angle as a `u16` turn fraction, clockwise from above.
    pub fn read(&mut self) -> Result<u16, Fault> {
        let mut frame = [0u8; 3];
        self.chip_select.set_low();
        let result = self.spi.read(&mut frame);
        // Release CS even when the transaction fails, before propagating its error.
        self.chip_select.set_high();
        // A failed transfer is as untrustworthy as a failed CRC.
        result.map_err(|_| Fault::EncoderCrc)?;
        // The MT6701 counts counter-clockwise from above.
        rcade_haptics_core::encoder::decode(frame).map(u16::wrapping_neg)
    }
}
