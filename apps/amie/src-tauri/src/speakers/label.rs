use super::timeline::SpeakerTimeline;
use crate::transcription::labels::SYSTEM_STREAM;

/// System-audio lines take the remote name when the timeline has exactly one.
/// Microphone lines stay on their own label.
pub fn speaker_for_segment(
    stream: &str,
    default_speaker: &str,
    start_ms: u64,
    end_ms: u64,
    timeline: &SpeakerTimeline,
) -> String {
    if stream != SYSTEM_STREAM {
        return default_speaker.to_string();
    }
    timeline
        .resolve(start_ms, end_ms)
        .unwrap_or_else(|| default_speaker.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speakers::timeline::{samples_to_ms, SpeakerTimeline};
    use crate::transcription::labels::{REMOTE, USER};

    #[test]
    fn system_commit_uses_the_capture_clock_and_mic_stays_user() {
        let at_ms = samples_to_ms(48_000, 48_000);
        assert_eq!(at_ms, 1_000);
        let mut timeline = SpeakerTimeline::new();
        timeline.push(at_ms, ["Ada Lovelace"]);

        assert_eq!(
            speaker_for_segment(SYSTEM_STREAM, REMOTE, 1_000, 2_000, &timeline),
            "Ada Lovelace"
        );
        assert_eq!(
            speaker_for_segment("mic", USER, 1_000, 2_000, &timeline),
            "User"
        );
    }
}
