use tauri::{AppHandle, State};

use crate::state::TranscriptionHandle;

#[tauri::command]
pub async fn start_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
) -> Result<(), String> {
    tracing::info!("start_transcription command invoked");

    state
        .service
        .start(app)
        .map_err(|e| e.to_user_message())?;

    tracing::info!("start_transcription command completed");
    Ok(())
}

#[tauri::command]
pub async fn stop_transcription(
    app: AppHandle,
    state: State<'_, TranscriptionHandle>,
) -> Result<(), String> {
    tracing::info!("stop_transcription command invoked");

    state
        .service
        .stop(&app)
        .map_err(|e| e.to_user_message())?;

    tracing::info!("stop_transcription command completed");
    Ok(())
}
