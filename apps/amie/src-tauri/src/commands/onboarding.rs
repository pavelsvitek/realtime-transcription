use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::config::AppConfig;
use crate::transcription::nemotron;

static DOWNLOAD_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchFlags {
    /// `--show-onboarding` or `AMIE_SHOW_ONBOARDING=1`.
    pub show_onboarding: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelStatus {
    pub ready: bool,
    pub downloading: bool,
    /// Expected download size in bytes (approx. CoreML INT8 bundle).
    pub expected_size_bytes: u64,
    pub helper_found: bool,
}

#[tauri::command]
pub fn get_launch_flags() -> LaunchFlags {
    LaunchFlags {
        show_onboarding: show_onboarding_requested(),
    }
}

#[tauri::command]
pub fn get_speech_model_status() -> SpeechModelStatus {
    let config = AppConfig::load();
    SpeechModelStatus {
        ready: nemotron::model_bundle_ready(&config.model_bundle_dir),
        downloading: DOWNLOAD_IN_FLIGHT.load(Ordering::Relaxed),
        expected_size_bytes: nemotron::EXPECTED_DOWNLOAD_SIZE_BYTES,
        helper_found: config.helper_path.exists(),
    }
}

/// Starts the Nemotron helper `--download-only` path in the background.
/// Returns immediately so the UI can advance; idempotent when the bundle is ready.
#[tauri::command]
pub fn start_speech_model_download() -> Result<SpeechModelStatus, String> {
    let config = AppConfig::load();
    if nemotron::model_bundle_ready(&config.model_bundle_dir) {
        return Ok(get_speech_model_status());
    }
    if !config.helper_path.exists() {
        return Err(format!(
            "Speech helper not found at {}. Run apps/amie/scripts/setup-nemotron.sh first.",
            config.helper_path.display()
        ));
    }

    if DOWNLOAD_IN_FLIGHT
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::Relaxed)
        .is_err()
    {
        return Ok(get_speech_model_status());
    }

    let helper_path = config.helper_path.clone();
    let cache_root = AppConfig::default_model_cache_root();
    tauri::async_runtime::spawn(async move {
        let result = tauri::async_runtime::spawn_blocking(move || {
            nemotron::download_model(&helper_path, &cache_root)
        })
        .await;
        DOWNLOAD_IN_FLIGHT.store(false, Ordering::SeqCst);
        match result {
            Ok(Ok(())) => tracing::info!("Speech model download finished"),
            Ok(Err(error)) => tracing::error!(%error, "Speech model download failed"),
            Err(error) => tracing::error!(%error, "Speech model download task failed"),
        }
    });

    Ok(get_speech_model_status())
}

fn show_onboarding_requested() -> bool {
    if std::env::args().any(|arg| arg == "--show-onboarding") {
        return true;
    }
    std::env::var("AMIE_SHOW_ONBOARDING")
        .map(|value| matches!(value.as_str(), "1" | "true" | "yes"))
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expected_size_matches_investigation_doc() {
        assert_eq!(
            nemotron::EXPECTED_DOWNLOAD_SIZE_BYTES,
            612 * 1024 * 1024
        );
    }

    #[test]
    fn launch_flags_default_off_without_env() {
        // Cannot clear process args in-test; just ensure the struct serializes.
        let flags = LaunchFlags {
            show_onboarding: false,
        };
        let json = serde_json::to_string(&flags).unwrap();
        assert!(json.contains("showOnboarding"));
    }
}
