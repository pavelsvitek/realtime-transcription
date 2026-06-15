use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::ipc::transcript::TranscriptExport;
use crate::state::TranscriptionHandle;
use crate::transcription::model::{self, ModelId, ModelInfo};
use crate::transcription::AudioSource;

#[tauri::command]
pub async fn list_transcription_models() -> Result<Vec<ModelInfo>, String> {
    Ok(model::list_models())
}

#[tauri::command]
pub async fn set_transcription_model(
    state: State<'_, TranscriptionHandle>,
    model: String,
) -> Result<(), String> {
    let model_id = ModelId::parse(&model)
        .ok_or_else(|| format!("Unknown transcription model: {model}"))?;

    state
        .service
        .set_model(model_id)
        .map_err(|e| e.to_user_message())
}

#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
    source: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    let audio_source = source
        .as_deref()
        .and_then(AudioSource::parse)
        .unwrap_or_else(AudioSource::default_for_testing);

    let model_id = model
        .as_deref()
        .and_then(ModelId::parse)
        .unwrap_or_else(ModelId::default_selection);

    tracing::info!(?audio_source, model = %model_id.as_str(), "start_transcription command invoked");

    state
        .service
        .start_with_model(app, audio_source, model_id)
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
