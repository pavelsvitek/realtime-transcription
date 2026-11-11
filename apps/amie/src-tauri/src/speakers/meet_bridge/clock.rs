//! Google Meet extension speaker-tracking bridge (`meet_bridge`).
//! Wall-clock stamps from the extension, mapped onto the system-audio sample clock.

/// How far Meet's level meter leads the same audio in Amie's capture.
///
/// TODO(phase-0): measure this on a live Google Meet call. `0` until then.
/// Positive if the meter fires before the audio is heard.
pub const MEET_METER_LEAD_MS: u64 = 0;

/// `at_ms = sample_now - clamp(wall_now - observed_at, 0, 2000) - MEET_METER_LEAD_MS`.
pub fn wall_to_sample_ms(sample_now_ms: u64, wall_now_ms: f64, observed_at_ms: f64) -> u64 {
    let lag_ms = (wall_now_ms - observed_at_ms).clamp(0.0, 2_000.0).round() as u64;
    sample_now_ms
        .saturating_sub(lag_ms)
        .saturating_sub(MEET_METER_LEAD_MS)
}

pub fn wall_now_ms() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64() * 1_000.0)
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transport_lag_is_subtracted_and_clamped() {
        assert_eq!(wall_to_sample_ms(1_000, 5_000.0, 4_990.0), 990);
        assert_eq!(wall_to_sample_ms(1_000, 5_000.0, 5_050.0), 1_000);
        assert_eq!(wall_to_sample_ms(1_000, 10_000.0, 0.0), 0);
    }

    #[test]
    fn meter_lead_ships_at_zero_until_phase_0() {
        assert_eq!(MEET_METER_LEAD_MS, 0);
    }
}
