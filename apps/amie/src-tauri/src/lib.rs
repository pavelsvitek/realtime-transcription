mod app_menu;
pub mod audio_device;
mod commands;
pub mod config;
mod error;
mod eval;
mod ipc;
mod llm;
pub mod mcp;
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
    if std::env::args().any(|arg| arg == "--print-accessibility-status") {
        // Headless probe for the running binary's TCC identity / trust.
        // Used to compare System Settings rows with this process.
        let status = speakers::status();
        match serde_json::to_string_pretty(&status) {
            Ok(json) => {
                println!("{json}");
                std::process::exit(if status.trusted { 0 } else { 2 });
            }
            Err(err) => {
                eprintln!("failed to serialize accessibility status: {err}");
                std::process::exit(1);
            }
        }
    }

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
        .plugin(tauri_plugin_process::init())
        .manage(meeting_store.clone())
        .manage(summaries.clone())
        .manage(TranscriptionHandle::new(meeting_store, summaries))
        .setup(|app| {
            #[cfg(desktop)]
            {
                // Production endpoints live in tauri.conf.json. Debug / `tauri dev`
                // passes an empty-endpoints overlay via scripts/tauri.sh so we never
                // poll public Releases from local builds (plan risk #10).
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }

            #[cfg(target_os = "macos")]
            {
                let _monitor = spawn_device_monitor(app.handle().clone());
                if let Err(err) = app_menu::install_macos_app_menu(app.handle()) {
                    tracing::error!(error = %err, "Failed to install macOS app menu");
                }
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
            commands::system_access::get_system_access_status,
            commands::system_access::open_system_access_settings,
            commands::mcp::get_mcp_status,
            commands::updates::get_app_install_location,
            commands::onboarding::get_launch_flags,
            commands::onboarding::get_speech_model_status,
            commands::onboarding::start_speech_model_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
