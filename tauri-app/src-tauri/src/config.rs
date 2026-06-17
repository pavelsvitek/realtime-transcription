use std::path::PathBuf;

use crate::transcription::whisperkit::{self, ModelMetadata};

const APP_SUPPORT_SUBDIR: &str = "com.pavel.tauri-app/models";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub helper_path: PathBuf,
    pub model_cache_dir: PathBuf,
    pub model_metadata: ModelMetadata,
    pub sample_rate: u32,
    pub channels: u16,
    pub language: String,
}

impl AppConfig {
    pub fn load() -> Self {
        let model_cache_dir = Self::default_model_cache_dir();
        let helper_path = std::env::var("WHISPERKIT_BRIDGE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| Self::default_helper_path());
        let model_metadata = whisperkit::validate_installation(&helper_path, &model_cache_dir)
            .unwrap_or_else(|_| ModelMetadata {
                model: whisperkit::MODEL_NAME.into(),
                model_path: String::new(),
                cache_dir: model_cache_dir.to_string_lossy().into_owned(),
                downloaded_at: String::new(),
            });

        Self {
            helper_path,
            model_cache_dir,
            model_metadata,
            sample_rate: 16_000,
            channels: 1,
            language: "en".into(),
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        whisperkit::validate_installation(&self.helper_path, &self.model_cache_dir).map(|_| ())
    }

    pub fn default_models_dir() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home)
            .join("Library/Application Support")
            .join(APP_SUPPORT_SUBDIR)
    }

    pub fn default_model_cache_dir() -> PathBuf {
        Self::default_models_dir().join(whisperkit::CACHE_SUBDIR)
    }

    pub fn default_helper_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has parent")
            .join("whisperkit-helper/.build/release/whisperkit-bridge")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_use_app_support_dir() {
        let config = AppConfig::load();
        let cache = config.model_cache_dir.to_string_lossy();
        assert!(cache.contains(APP_SUPPORT_SUBDIR));
        assert!(cache.ends_with(whisperkit::CACHE_SUBDIR));
    }

    #[test]
    fn helper_default_path_points_at_helper_package() {
        let path = AppConfig::default_helper_path().to_string_lossy().into_owned();
        assert!(path.contains("whisperkit-helper/.build/release/whisperkit-bridge"));
    }
}
