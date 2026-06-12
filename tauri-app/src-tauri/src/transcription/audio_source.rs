use serde::{Deserialize, Serialize};

use super::labels;

/// Input used for the transcription session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    Mic,
    /// macOS ScreenCaptureKit — captures Chrome (or display audio as fallback).
    SystemAudio,
}

impl AudioSource {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "mic" => Some(Self::Mic),
            "system" | "system_audio" => Some(Self::SystemAudio),
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
}
