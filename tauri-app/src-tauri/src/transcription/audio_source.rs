use serde::{Deserialize, Serialize};

use super::labels;

/// Input used for the transcription session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Mic,
    /// macOS ScreenCaptureKit — captures Chrome (or display audio as fallback).
    SystemAudio,
    /// Open mic and system audio simultaneously, running independent ASR pipelines.
    Both,
}

impl AudioSource {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "mic" => Some(Self::Mic),
            "system" | "system_audio" => Some(Self::SystemAudio),
            "both" => Some(Self::Both),
            _ => None,
        }
    }

    /// Default to system audio for repeatable YouTube/Chrome testing.
    pub fn default_for_testing() -> Self {
        std::env::var("TRANSCRIPTION_AUDIO_SOURCE")
            .ok()
            .and_then(|v| Self::parse(&v))
            .unwrap_or(Self::SystemAudio)
    }
}

/// Speaker/stream labels attached to transcript events for this source.
#[derive(Debug, Clone, Copy)]
pub struct StreamLabels {
    pub speaker: &'static str,
    pub stream: &'static str,
}

impl AudioSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mic => "mic",
            Self::SystemAudio => "system",
            Self::Both => "both",
        }
    }

    /// Returns stream labels for single-source modes.
    ///
    /// Panics on `Both` — callers handling `Both` must use
    /// `AudioSource::Mic.labels()` and `AudioSource::SystemAudio.labels()` directly.
    pub fn labels(self) -> StreamLabels {
        match self {
            Self::Mic => StreamLabels {
                speaker: labels::USER,
                stream: labels::MIC_STREAM,
            },
            Self::SystemAudio => StreamLabels {
                speaker: labels::REMOTE,
                stream: labels::SYSTEM_STREAM,
            },
            Self::Both => panic!(
                "AudioSource::Both has no single stream labels; \
                 use AudioSource::Mic.labels() and AudioSource::SystemAudio.labels() separately"
            ),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_audio_sources() {
        assert_eq!(AudioSource::parse("mic"), Some(AudioSource::Mic));
        assert_eq!(
            AudioSource::parse("system"),
            Some(AudioSource::SystemAudio)
        );
        assert_eq!(AudioSource::parse("unknown"), None);
    }

    #[test]
    fn parse_both() {
        assert_eq!(AudioSource::parse("both"), Some(AudioSource::Both));
        assert_eq!(AudioSource::Both.as_str(), "both");
    }

    #[test]
    fn labels_for_individual_sources() {
        let mic = AudioSource::Mic.labels();
        assert_eq!(mic.speaker, "User");
        assert_eq!(mic.stream, "mic");

        let sys = AudioSource::SystemAudio.labels();
        assert_eq!(sys.speaker, "Remote");
        assert_eq!(sys.stream, "system");
    }
}
