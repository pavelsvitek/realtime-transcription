use std::path::PathBuf;

const DEFAULT_WHISPER_MODEL: &str = "ggml-small.en.bin";
const PREFERRED_WHISPER_MODEL: &str = "ggml-large-v3-turbo.bin";
const DEFAULT_VAD_MODEL: &str = "ggml-silero-v6.2.0.bin";
const APP_SUPPORT_SUBDIR: &str = "com.pavel.tauri-app/models";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub whisper_model_path: PathBuf,
    pub vad_model_path: PathBuf,
    pub sample_rate: u32,
    pub channels: u16,
    pub language: String,
}

impl AppConfig {
    pub fn load() -> Self {
        let models_dir = Self::default_models_dir();

        let whisper_model_path = std::env::var("WHISPER_MODEL_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| Self::default_whisper_model_path(&models_dir));

        let vad_model_path = std::env::var("VAD_MODEL_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| models_dir.join(DEFAULT_VAD_MODEL));

        Self {
            whisper_model_path,
            vad_model_path,
            sample_rate: 16_000,
            channels: 1,
            language: "en".into(),
        }
    }

    /// Prefer `ggml-large-v3-turbo.bin` when present, else `ggml-small.en.bin`.
    pub fn default_whisper_model_path(models_dir: &std::path::Path) -> PathBuf {
        let preferred = models_dir.join(PREFERRED_WHISPER_MODEL);
        if preferred.exists() {
            preferred
        } else {
            models_dir.join(DEFAULT_WHISPER_MODEL)
        }
    }

    pub fn default_models_dir() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home)
            .join("Library/Application Support")
            .join(APP_SUPPORT_SUBDIR)
    }

    pub fn validate(&self) -> Result<(), String> {
        if !self.whisper_model_path.exists() {
            return Err(format!(
                "Whisper model not found at {}",
                self.whisper_model_path.display()
            ));
        }
        if !self.vad_model_path.exists() {
            return Err(format!(
                "VAD model not found at {}",
                self.vad_model_path.display()
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serial_test::serial;

    #[test]
    #[serial]
    fn env_var_overrides_default_whisper_path() {
        let custom = "/tmp/test-model.bin";
        std::env::set_var("WHISPER_MODEL_PATH", custom);
        let config = AppConfig::load();
        std::env::remove_var("WHISPER_MODEL_PATH");

        assert_eq!(config.whisper_model_path, PathBuf::from(custom));
    }

    #[test]
    #[serial]
    fn env_var_overrides_default_vad_path() {
        let custom = "/tmp/test-vad.bin";
        std::env::set_var("VAD_MODEL_PATH", custom);
        let config = AppConfig::load();
        std::env::remove_var("VAD_MODEL_PATH");

        assert_eq!(config.vad_model_path, PathBuf::from(custom));
    }

    #[test]
    #[serial]
    fn defaults_use_app_support_dir() {
        std::env::remove_var("WHISPER_MODEL_PATH");
        std::env::remove_var("VAD_MODEL_PATH");
        let config = AppConfig::load();
        let path = config.whisper_model_path.to_string_lossy();

        assert!(path.contains(APP_SUPPORT_SUBDIR));
        assert!(
            path.ends_with(DEFAULT_WHISPER_MODEL) || path.ends_with(PREFERRED_WHISPER_MODEL),
            "unexpected default whisper path: {path}"
        );
    }

    #[test]
    fn validate_fails_for_missing_model() {
        let config = AppConfig {
            whisper_model_path: PathBuf::from("/nonexistent/model.bin"),
            vad_model_path: PathBuf::from("/nonexistent/vad.bin"),
            sample_rate: 16_000,
            channels: 1,
            language: "en".into(),
        };

        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Whisper model not found"));
    }
}
