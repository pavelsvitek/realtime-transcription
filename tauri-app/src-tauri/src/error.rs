use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Transcription is already running")]
    AlreadyRunning,

    #[allow(dead_code)]
    #[error("Transcription is not running")]
    NotRunning,

    #[error("Audio capture failed: {0}")]
    Capture(String),

    #[error("ASR failed: {0}")]
    Asr(String),

    #[error("Model loading failed: {0}")]
    ModelLoad(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

impl AppError {
    pub fn to_user_message(&self) -> String {
        match self {
            Self::AlreadyRunning => "Transcription is already running.".into(),
            Self::NotRunning => "Transcription is not running.".into(),
            Self::Capture(msg) => format!("Microphone error: {msg}"),
            Self::Asr(msg) => format!("Transcription engine error: {msg}"),
            Self::ModelLoad(msg) => format!("Failed to load model: {msg}"),
            Self::Io(err) => format!("File error: {err}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_messages_are_user_readable() {
        let cases = vec![
            (AppError::AlreadyRunning, "Transcription is already running"),
            (AppError::NotRunning, "Transcription is not running"),
            (
                AppError::Capture("device lost".into()),
                "Audio capture failed: device lost",
            ),
            (
                AppError::Asr("decode error".into()),
                "ASR failed: decode error",
            ),
            (
                AppError::ModelLoad("file not found".into()),
                "Model loading failed: file not found",
            ),
        ];

        for (err, expected) in cases {
            assert_eq!(err.to_string(), expected);
        }
    }

    #[test]
    fn user_messages_differ_from_display() {
        let err = AppError::Capture("permission denied".into());
        let user_msg = err.to_user_message();
        assert!(user_msg.starts_with("Microphone error:"));
        assert!(user_msg.contains("permission denied"));
    }
}
