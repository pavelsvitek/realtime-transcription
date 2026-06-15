use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::config::AppConfig;

const SETTINGS_FILE: &str = "settings.json";

pub const CANARY_COREML_DIR: &str = "canary-coreml";

const CANARY_PACKAGES: &[(&str, &str)] = &[
    ("encoder_int8.mlpackage", "encoder_int8.mlpackage"),
    ("projection.mlpackage", "projection.mlpackage"),
    (
        "canary_decoder_stateful_int8.mlpackage",
        "canary_decoder_stateful_int8.mlpackage",
    ),
    ("canary_lm_head_int8.mlpackage", "canary_lm_head_int8.mlpackage"),
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ModelId {
    WhisperSmallEn,
    WhisperLargeV3Turbo,
    CanaryQwenCoreML,
}

impl ModelId {
    pub fn all() -> &'static [ModelId] {
        &[
            ModelId::WhisperLargeV3Turbo,
            ModelId::WhisperSmallEn,
            ModelId::CanaryQwenCoreML,
        ]
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::WhisperSmallEn => "whisper-small-en",
            Self::WhisperLargeV3Turbo => "whisper-large-v3-turbo",
            Self::CanaryQwenCoreML => "canary-qwen-coreml",
        }
    }

    pub fn display_name(self) -> &'static str {
        match self {
            Self::WhisperSmallEn => "Whisper small.en",
            Self::WhisperLargeV3Turbo => "Whisper large-v3-turbo",
            Self::CanaryQwenCoreML => "Canary Qwen 2.5B (CoreML)",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "whisper-small-en" => Some(Self::WhisperSmallEn),
            "whisper-large-v3-turbo" => Some(Self::WhisperLargeV3Turbo),
            "canary-qwen-coreml" | "canary-qwen-2.5b" => Some(Self::CanaryQwenCoreML),
            _ => None,
        }
    }

    pub fn is_whisper(self) -> bool {
        matches!(self, Self::WhisperSmallEn | Self::WhisperLargeV3Turbo)
    }

    pub fn whisper_filename(self) -> Option<&'static str> {
        match self {
            Self::WhisperSmallEn => Some("ggml-small.en.bin"),
            Self::WhisperLargeV3Turbo => Some("ggml-large-v3-turbo.bin"),
            Self::CanaryQwenCoreML => None,
        }
    }

    pub fn whisper_model_path(self, models_dir: &Path) -> Option<PathBuf> {
        self.whisper_filename()
            .map(|name| models_dir.join(name))
    }

    pub fn default_selection() -> Self {
        if let Ok(raw) = std::env::var("TRANSCRIPTION_MODEL") {
            if let Some(id) = Self::parse(&raw) {
                return id;
            }
        }

        if let Ok(saved) = load_selected_model_from_disk() {
            return saved;
        }

        let models_dir = AppConfig::default_models_dir();
        if models_dir.join("ggml-large-v3-turbo.bin").exists() {
            Self::WhisperLargeV3Turbo
        } else {
            Self::WhisperSmallEn
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub unavailable_reason: Option<String>,
}

pub fn canary_models_dir() -> PathBuf {
    AppConfig::default_models_dir().join(CANARY_COREML_DIR)
}

pub fn list_models() -> Vec<ModelInfo> {
    let models_dir = AppConfig::default_models_dir();
    let vad_path = AppConfig::load().vad_model_path;
    let canary_dir = canary_models_dir();

    ModelId::all()
        .iter()
        .map(|&id| model_info(id, &models_dir, &vad_path, &canary_dir))
        .collect()
}

fn model_info(
    id: ModelId,
    models_dir: &Path,
    vad_path: &Path,
    canary_dir: &Path,
) -> ModelInfo {
    let (available, unavailable_reason) = match id {
        ModelId::WhisperSmallEn | ModelId::WhisperLargeV3Turbo => {
            let whisper_path = id.whisper_model_path(models_dir).unwrap();
            if !whisper_path.exists() {
                (
                    false,
                    Some(format!(
                        "Download {} to {}",
                        whisper_path.file_name().unwrap().to_string_lossy(),
                        models_dir.display()
                    )),
                )
            } else if !vad_path.exists() {
                (
                    false,
                    Some(format!("VAD model not found at {}", vad_path.display())),
                )
            } else {
                (true, None)
            }
        }
        ModelId::CanaryQwenCoreML => check_canary_available(canary_dir),
    };

    ModelInfo {
        id: id.as_str().to_string(),
        name: id.display_name().to_string(),
        available,
        unavailable_reason,
    }
}

pub fn check_canary_available_public(canary_dir: &Path) -> (bool, Option<String>) {
    check_canary_available(canary_dir)
}

fn check_canary_available(canary_dir: &Path) -> (bool, Option<String>) {
    if !macos_version_at_least(15) {
        return (
            false,
            Some("Canary CoreML requires macOS 15 or newer (stateful decoder; app minimum)".into()),
        );
    }

    for (label, file) in CANARY_PACKAGES {
        let path = canary_dir.join(file);
        if !path.exists() {
            return (
                false,
                Some(format!(
                    "Missing {label} at {}. Run model download.",
                    path.display()
                )),
            );
        }
    }

    let mel = canary_dir.join("canary_mel_window.bin");
    if !mel.exists() {
        return (
            false,
            Some(format!("Missing mel filterbank at {}", mel.display())),
        );
    }

    let tokenizer = canary_dir.join("tokenizer.json");
    if !tokenizer.exists() {
        return (
            false,
            Some(format!("Missing tokenizer at {}", tokenizer.display())),
        );
    }

    (true, None)
}

pub fn macos_version_at_least(major: u32) -> bool {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let version = String::from_utf8_lossy(&out.stdout);
                let major_str = version.trim().split('.').next().unwrap_or("0");
                major_str.parse::<u32>().unwrap_or(0) >= major
            }
            _ => false,
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = major;
        false
    }
}

pub fn settings_path() -> PathBuf {
    AppConfig::default_models_dir()
        .parent()
        .unwrap_or(Path::new("."))
        .join(SETTINGS_FILE)
}

#[derive(Serialize, Deserialize)]
struct SettingsFile {
    selected_model: String,
}

pub fn load_selected_model_from_disk() -> Result<ModelId, std::io::Error> {
    let path = settings_path();
    let raw = fs::read_to_string(path)?;
    let settings: SettingsFile = serde_json::from_str(&raw)?;
    ModelId::parse(&settings.selected_model).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("unknown model id: {}", settings.selected_model),
        )
    })
}

pub fn save_selected_model(id: ModelId) -> Result<(), std::io::Error> {
    let path = settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let settings = SettingsFile {
        selected_model: id.as_str().to_string(),
    };
    fs::write(path, serde_json::to_string_pretty(&settings).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_id_roundtrip() {
        for id in ModelId::all() {
            assert_eq!(ModelId::parse(id.as_str()), Some(*id));
        }
    }

    #[test]
    fn whisper_models_have_filenames() {
        assert_eq!(
            ModelId::WhisperSmallEn.whisper_filename(),
            Some("ggml-small.en.bin")
        );
        assert_eq!(ModelId::CanaryQwenCoreML.whisper_filename(), None);
    }

    #[test]
    fn list_models_includes_canary() {
        let models = list_models();
        let canary = models
            .iter()
            .find(|m| m.id == ModelId::CanaryQwenCoreML.as_str())
            .expect("canary model listed");
        assert_eq!(canary.name, "Canary Qwen 2.5B (CoreML)");
        // On macOS 14 and below, Canary is listed but unavailable (requires macOS 15+).
        if macos_version_at_least(15) {
            let (available, _) =
                check_canary_available_public(&crate::config::AppConfig::default_models_dir().join(CANARY_COREML_DIR));
            assert_eq!(canary.available, available);
        } else {
            assert!(!canary.available);
            assert!(canary.unavailable_reason.is_some());
        }
    }
}
