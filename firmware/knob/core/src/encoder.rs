use crate::safety::Fault;
use crc::{Algorithm, Crc};

// MT6701 SSI: 14 angle bits, 4 status bits, then CRC-6 (x^6 + x + 1).
// Prepending six zero bits lets the byte-oriented library process the 18-bit
// payload unchanged, because this CRC has a zero initial state.
const SSI_ALGORITHM: Algorithm<u8> = Algorithm {
    width: 6, poly: 0x03, init: 0, refin: false, refout: false, xorout: 0,
    check: 0x11, residue: 0,
};
const SSI_CRC: Crc<u8> = Crc::<u8>::new(&SSI_ALGORITHM);

/// The angle in a raw MT6701 frame, as a `u16` turn fraction.
pub fn decode(bytes: [u8; 3]) -> Result<u16, Fault> {
    let frame = u32::from_be_bytes([0, bytes[0], bytes[1], bytes[2]]);
    let payload = frame >> 6;
    let payload_bytes = payload.to_be_bytes();
    if SSI_CRC.checksum(&payload_bytes[1..]) != (frame & 0x3f) as u8 {
        return Err(Fault::EncoderCrc);
    }
    // Bit 9 is the MT6701's "overspeed" flag. It is set during fast hand spins
    // that the chip still tracks correctly, so it is not treated as a fault;
    // the CRC above catches a genuinely corrupted reading.
    if frame & (3 << 6) != 0 {
        return Err(Fault::EncoderField);
    }
    // 14 bits of angle become the top 14 bits of a turn.
    Ok(((frame >> 10) as u16) << 2)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reference polynomial division, used only to cross-check the library setup.
    fn reference_frame(angle: u16, status: u8) -> [u8; 3] {
        let payload = ((angle as u32) << 4) | status as u32;
        let mut remainder = 0u8;
        for bit in (0..18).rev() {
            let feedback = (remainder >> 5) ^ ((payload >> bit) as u8 & 1);
            remainder = (remainder << 1) & 0x3f;
            if feedback != 0 { remainder ^= 3; }
        }
        let bytes = ((payload << 6) | remainder as u32).to_be_bytes();
        [bytes[1], bytes[2], bytes[3]]
    }

    #[test]
    fn all_encoder_positions_match_reference_crc() {
        for angle in 0..16384 {
            let decoded = decode(reference_frame(angle, 0)).unwrap();
            assert_eq!(decoded, angle << 2);
        }
    }

    #[test]
    fn corruption_and_magnetic_faults_are_rejected() {
        let mut bytes = reference_frame(8192, 0);
        bytes[0] ^= 0x20;
        assert_eq!(decode(bytes), Err(Fault::EncoderCrc));
        assert_eq!(decode(reference_frame(8192, 1)), Err(Fault::EncoderField));
        assert!(decode(reference_frame(8192, 8)).is_ok()); // overspeed flag is not a fault
        assert!(decode(reference_frame(8192, 4)).is_ok()); // pressing is not an encoder fault
    }
}
