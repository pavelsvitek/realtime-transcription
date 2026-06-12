mod commands;
pub mod config;
mod error;
mod eval;
mod ipc;
mod state;
pub mod transcription;

pub use eval::wer::{evaluate as evaluate_wer, WerReport};
pub use config::AppConfig;
pub use transcription::{AudioSource, LoadedModels, TranscriptionService};

use state::TranscriptionHandle;
use tracing_subscriber::EnvFilter;

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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(TranscriptionHandle::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::transcription::start_transcription,
            commands::transcription::stop_transcription,
            commands::transcription::export_transcript,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
