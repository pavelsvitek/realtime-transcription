//! ASR backend selection (local Nemotron vs cloud xAI).

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AsrBackend {
    #[default]
    Local,
    Xai,
}

impl AsrBackend {
    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "local" | "whisperkit" | "whisper" | "nemotron" | "parakeet" => Some(Self::Local),
            "xai" | "x-ai" | "grok" => Some(Self::Xai),
            _ => None,
        }
    }

    pub fn from_env() -> Self {
        std::env::var("ASR_BACKEND")
            .ok()
            .as_deref()
            .and_then(Self::parse)
            .unwrap_or_default()
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Xai => "xai",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_backends() {
        assert_eq!(AsrBackend::parse("local"), Some(AsrBackend::Local));
        assert_eq!(AsrBackend::parse("Nemotron"), Some(AsrBackend::Local));
        assert_eq!(AsrBackend::parse("parakeet"), Some(AsrBackend::Local));
        assert_eq!(AsrBackend::parse("WhisperKit"), Some(AsrBackend::Local));
        assert_eq!(AsrBackend::parse("xai"), Some(AsrBackend::Xai));
        assert_eq!(AsrBackend::parse("nope"), None);
    }
}
