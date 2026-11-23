use std::path::PathBuf;

use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, State};

use crate::ipc::transcript::{TranscriptExport, TranscriptionSnapshot};
use crate::state::TranscriptionHandle;
use crate::telemetry::TelemetryService;
use crate::transcription::{nemotron, xai, AsrBackend, AudioSource};

#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
    telemetry: State<'_, TelemetryService>,
    source: Option<String>,
    backend: Option<String>,
    context: Option<String>,
) -> Result<(), String> {
    let audio_source = source
        .as_deref()
        .and_then(AudioSource::parse)
        .unwrap_or_else(AudioSource::default_for_testing);
    let asr_backend = backend
        .as_deref()
        .and_then(AsrBackend::parse)
        .unwrap_or_default();

    tracing::info!(
        ?audio_source,
        ?asr_backend,
        context_chars = context.as_deref().map(str::len).unwrap_or(0),
        "start_transcription command invoked"
    );

    state
        .service
        .start(app, audio_source, asr_backend, context.as_deref())
        .map_err(|e| e.to_user_message())?;

    telemetry.mark_meeting_started();
    telemetry.track(
        "meeting_started",
        Some(json!({
            "source": format!("{audio_source:?}").to_lowercase(),
            "backend": format!("{asr_backend:?}").to_lowercase(),
            "has_context": context.as_deref().is_some_and(|c| !c.trim().is_empty()),
        })),
    );

    tracing::info!("start_transcription command completed");
    Ok(())
}

#[tauri::command]
pub async fn stop_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
    telemetry: State<'_, TelemetryService>,
) -> Result<TranscriptExport, String> {
    tracing::info!("stop_transcription command invoked");

    let export = state
        .service
        .stop(Some(&app))
        .map_err(|e| e.to_user_message())?;

    let duration_sec = telemetry.take_meeting_duration_sec();
    telemetry.track(
        "meeting_ended",
        Some(json!({
            "source": export.source,
            "word_count": export.word_count,
            "duration_sec": duration_sec,
        })),
    );
    telemetry.spawn_flush();

    tracing::info!("stop_transcription command completed");
    Ok(export)
}

#[tauri::command]
pub async fn get_transcription_status(
    state: State<'_, TranscriptionHandle>,
) -> Result<TranscriptionSnapshot, String> {
    Ok(state.service.snapshot())
}

#[tauri::command]
pub async fn export_transcript(
    state: State<'_, TranscriptionHandle>,
    telemetry: State<'_, TelemetryService>,
    path: String,
) -> Result<TranscriptExport, String> {
    tracing::info!(%path, "export_transcript command invoked");

    let export = state
        .service
        .export_to_file(PathBuf::from(path).as_path())
        .map_err(|e| e.to_user_message())?;

    telemetry.track(
        "transcript_exported",
        Some(json!({ "word_count": export.word_count })),
    );

    Ok(export)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AsrSettings {
    pub backend_options: Vec<&'static str>,
    pub language: &'static str,
    pub language_from_env: bool,
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
        language: nemotron::resolve_language(),
        language_from_env: nemotron::language_from_env(),
        xai_api_key_set: saved || from_env,
        xai_api_key_saved: saved,
        xai_api_key_from_env: from_env,
    })
}

#[tauri::command]
pub async fn set_asr_language(language: String) -> Result<(), String> {
    nemotron::save_language(&language)?;
    Ok(())
}

#[tauri::command]
pub async fn set_xai_api_key(key: String) -> Result<(), String> {
    xai::save_api_key(&key)
}

#[tauri::command]
pub async fn clear_xai_api_key() -> Result<(), String> {
    xai::clear_api_key()
}
