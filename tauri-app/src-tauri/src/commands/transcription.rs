use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::ipc::transcript::TranscriptExport;
use crate::state::TranscriptionHandle;
use crate::transcription::{xai, AsrBackend, AudioSource};

#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
    source: Option<String>,
    backend: Option<String>,
) -> Result<(), String> {
    let audio_source = source
        .as_deref()
        .and_then(AudioSource::parse)
        .unwrap_or_else(AudioSource::default_for_testing);
    let asr_backend = backend
        .as_deref()
        .and_then(AsrBackend::parse)
        .unwrap_or_default();

    tracing::info!(?audio_source, ?asr_backend, "start_transcription command invoked");

    state
        .service
        .start(app, audio_source, asr_backend)
        .map_err(|e| e.to_user_message())?;

    tracing::info!("start_transcription command completed");
    Ok(())
}

#[tauri::command]
pub async fn stop_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
) -> Result<TranscriptExport, String> {
    tracing::info!("stop_transcription command invoked");

    let export = state
        .service
        .stop(Some(&app))
        .map_err(|e| e.to_user_message())?;

    tracing::info!("stop_transcription command completed");
    Ok(export)
}

#[tauri::command]
pub async fn export_transcript(
    state: State<'_, TranscriptionHandle>,
    path: String,
) -> Result<TranscriptExport, String> {
    tracing::info!(%path, "export_transcript command invoked");

    state
        .service
        .export_to_file(PathBuf::from(path).as_path())
        .map_err(|e| e.to_user_message())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrSettings {
    pub backend_options: Vec<&'static str>,
    pub xai_api_key_set: bool,
    pub xai_api_key_saved: bool,
    pub xai_api_key_from_env: bool,
}

#[tauri::command]
pub async fn get_asr_settings() -> Result<AsrSettings, String> {
    let from_env = std::env::var("XAI_API_KEY")
        .ok()
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false);
    let saved = xai::load_api_key().is_some();
    Ok(AsrSettings {
        backend_options: vec!["local", "xai"],
        xai_api_key_set: saved || from_env,
        xai_api_key_saved: saved,
        xai_api_key_from_env: from_env,
    })
}

#[tauri::command]
pub async fn set_xai_api_key(key: String) -> Result<(), String> {
    xai::save_api_key(&key)
}

#[tauri::command]
pub async fn clear_xai_api_key() -> Result<(), String> {
    xai::clear_api_key()
}
