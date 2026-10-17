use serde::Serialize;
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::transcription::nemotron;

pub mod event_names {
    pub const DOWNLOAD_PROGRESS: &str = "speech-model/download-progress";
}

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
    /// 0–100 while a background download is running; null when idle.
    pub download_percent: Option<u8>,
    /// Expected download size in bytes (approx. CoreML INT8 bundle).
    pub expected_size_bytes: u64,
    pub helper_found: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModelDownloadProgress {
    pub downloading: bool,
    pub percent: u8,
    pub stage: String,
    pub ready: bool,
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
    let downloading = nemotron::download_in_flight();
    SpeechModelStatus {
        ready: nemotron::model_bundle_ready(&config.model_bundle_dir),
        downloading,
        download_percent: if downloading {
            Some(nemotron::download_percent())
        } else {
            None
        },
        expected_size_bytes: nemotron::EXPECTED_DOWNLOAD_SIZE_BYTES,
        helper_found: config.helper_path.exists(),
    }
}

/// Starts the Nemotron helper `--download-only` path in the background.
/// Returns immediately so the UI can advance; idempotent when the bundle is ready.
#[tauri::command]
pub fn start_speech_model_download(app: AppHandle) -> Result<SpeechModelStatus, String> {
    let config = AppConfig::load();
    if nemotron::model_bundle_ready(&config.model_bundle_dir) {
        emit_progress(&app, false, 100, "ready", true);
        return Ok(get_speech_model_status());
    }
    if !config.helper_path.exists() {
        return Err(format!(
            "Speech helper not found at {}. Run apps/amie/scripts/setup-nemotron.sh first.",
            config.helper_path.display()
        ));
    }

    if !nemotron::try_begin_download() {
        return Ok(get_speech_model_status());
    }

    nemotron::set_download_percent(0);
    emit_progress(&app, true, 0, "starting", false);

    let helper_path = config.helper_path.clone();
    let cache_root = AppConfig::default_model_cache_root();
    let app_for_progress = app.clone();
    let on_progress: Arc<nemotron::DownloadProgressFn> = Arc::new(move |percent, stage| {
        nemotron::set_download_percent(percent);
        emit_progress(&app_for_progress, true, percent, &stage, false);
    });

    tauri::async_runtime::spawn(async move {
        let progress = on_progress.clone();
        let result = tauri::async_runtime::spawn_blocking(move || {
            nemotron::download_model_with_progress(&helper_path, &cache_root, Some(progress))
        })
        .await;
        nemotron::end_download();
        match result {
            Ok(Ok(())) => {
                nemotron::set_download_percent(100);
                emit_progress(&app, false, 100, "ready", true);
                tracing::info!("Speech model download finished");
            }
            Ok(Err(error)) => {
                emit_progress(&app, false, nemotron::download_percent(), "error", false);
                tracing::error!(%error, "Speech model download failed");
            }
            Err(error) => {
                emit_progress(&app, false, nemotron::download_percent(), "error", false);
                tracing::error!(%error, "Speech model download task failed");
            }
        }
    });

    Ok(get_speech_model_status())
}

fn emit_progress(app: &AppHandle, downloading: bool, percent: u8, stage: &str, ready: bool) {
    let _ = app.emit(
        event_names::DOWNLOAD_PROGRESS,
        SpeechModelDownloadProgress {
            downloading,
            percent,
            stage: stage.to_string(),
            ready,
        },
    );
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
        let flags = LaunchFlags {
            show_onboarding: false,
        };
        let json = serde_json::to_string(&flags).unwrap();
        assert!(json.contains("showOnboarding"));
    }
}
