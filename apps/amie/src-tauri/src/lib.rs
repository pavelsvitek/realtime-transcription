pub mod audio_device;
mod commands;
pub mod config;
mod error;
mod eval;
mod ipc;
mod llm;
mod meetings;
mod speakers;
mod state;
pub mod transcription;

pub use config::AppConfig;
pub use eval::wer::{evaluate as evaluate_wer, WerReport};
pub use transcription::{AsrBackend, AudioSource, LoadedEngine, TranscriptionService};

use llm::SummaryService;
use meetings::MeetingStore;
use state::TranscriptionHandle;
use tracing_subscriber::EnvFilter;

#[cfg(target_os = "macos")]
use crate::audio_device::spawn_device_monitor;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("amie_lib=info")),
        )
        .init();

    let meeting_store = MeetingStore::open_default().unwrap_or_else(|err| {
        panic!("Failed to open meetings.db: {err}");
    });
    let summaries = SummaryService::new(meeting_store.clone());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(meeting_store.clone())
        .manage(summaries.clone())
        .manage(TranscriptionHandle::new(meeting_store, summaries))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _monitor = spawn_device_monitor(app.handle().clone());
            }
            if std::env::var_os("GENERATE_ALL_MEETING_SUMMARIES").is_some() {
                use tauri::Manager;
                let summaries = app.state::<SummaryService>().inner().clone();
                match summaries.start_all_finished(llm::emitter_from_app(app.handle().clone())) {
                    Ok(result) => tracing::info!(
                        queued = result.queued,
                        skipped_empty = result.skipped_empty,
                        "Queued meeting summary backfill"
                    ),
                    Err(e) => tracing::error!(
                        error = %e,
                        "Failed to queue meeting summary backfill"
                    ),
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::audio_device::get_default_input_device_command,
            commands::transcription::start_transcription,
            commands::transcription::stop_transcription,
            commands::transcription::get_transcription_status,
            commands::transcription::export_transcript,
            commands::transcription::get_asr_settings,
            commands::transcription::set_xai_api_key,
            commands::transcription::clear_xai_api_key,
            commands::meetings::get_all_meetings,
            commands::meetings::get_meeting,
            commands::meetings::get_live_meeting,
            commands::meetings::patch_meeting,
            commands::meetings::generate_meeting_summary,
            commands::meetings::get_summary_job,
            commands::meetings::generate_all_meeting_summaries,
            commands::meetings::get_summary_settings,
            commands::meetings::set_summary_provider,
            commands::meetings::set_openai_api_key,
            commands::meetings::clear_openai_api_key,
            commands::meetings::set_gemini_api_key,
            commands::meetings::clear_gemini_api_key,
            commands::meetings::delete_meeting,
            commands::speakers::get_speaker_tags_status,
            commands::speakers::request_accessibility_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
