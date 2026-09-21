use std::path::PathBuf;

use crate::transcription::nemotron;

const APP_SUPPORT_SUBDIR: &str = "com.pavel.amie/models";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub helper_path: PathBuf,
    pub model_bundle_dir: PathBuf,
    pub sample_rate: u32,
    pub channels: u16,
}

impl AppConfig {
    pub fn load() -> Self {
        let model_bundle_dir = Self::default_model_bundle_dir();
        let helper_path = std::env::var("NEMOTRON_BRIDGE_PATH")
            .map(PathBuf::from)
            .unwrap_or_else(|_| Self::default_helper_path());

        Self {
            helper_path,
            model_bundle_dir,
            sample_rate: 16_000,
            channels: 1,
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        nemotron::validate_installation(&self.helper_path, &self.model_bundle_dir)
    }

    pub fn default_models_dir() -> PathBuf {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home)
            .join("Library/Application Support")
            .join(APP_SUPPORT_SUBDIR)
    }

    pub fn default_model_cache_root() -> PathBuf {
        Self::default_models_dir().join(nemotron::CACHE_SUBDIR)
    }

    pub fn default_model_bundle_dir() -> PathBuf {
        nemotron::default_model_bundle_dir(&Self::default_model_cache_root())
    }

    pub fn default_helper_path() -> PathBuf {
        if let Some(path) = Self::bundled_helper_path().filter(|path| path.exists()) {
            return path;
        }

        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("src-tauri has parent")
            .join("nemotron-helper/.build/release/nemotron-bridge")
    }

    fn bundled_helper_path() -> Option<PathBuf> {
        std::env::current_exe()
            .ok()
            .and_then(|path| path.parent().map(|parent| parent.join("nemotron-bridge")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_use_app_support_dir() {
        let config = AppConfig::load();
        let bundle = config.model_bundle_dir.to_string_lossy();
        assert!(bundle.contains(APP_SUPPORT_SUBDIR));
        assert!(bundle.ends_with("Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8"));
    }

    #[test]
    fn helper_default_path_points_at_helper_package() {
        let path = AppConfig::default_helper_path()
            .to_string_lossy()
            .into_owned();
        assert!(path.contains("nemotron-helper/.build/release/nemotron-bridge"));
    }
}
