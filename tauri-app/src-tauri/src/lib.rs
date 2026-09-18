pub mod audio_device;
mod commands;
pub mod config;
mod error;
mod eval;
mod ipc;
mod meetings;
mod state;
pub mod transcription;

pub use config::AppConfig;
pub use eval::wer::{evaluate as evaluate_wer, WerReport};
pub use transcription::{AsrBackend, AudioSource, LoadedEngine, TranscriptionService};

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
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("tauri_app_lib=info")),
        )
        .init();

    let meeting_store = MeetingStore::open_default().unwrap_or_else(|err| {
        panic!("Failed to open meetings.db: {err}");
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(meeting_store.clone())
        .manage(TranscriptionHandle::new(meeting_store))
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                let _monitor = spawn_device_monitor(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::audio_device::get_default_input_device_command,
            commands::transcription::start_transcription,
            commands::transcription::stop_transcription,
            commands::transcription::export_transcript,
            commands::transcription::get_asr_settings,
            commands::transcription::set_xai_api_key,
            commands::transcription::clear_xai_api_key,
            commands::meetings::list_meetings,
            commands::meetings::get_meeting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
