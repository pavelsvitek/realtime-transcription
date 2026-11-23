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
pub mod speakers;
mod state;
pub mod telemetry;
pub mod transcription;

pub use config::AppConfig;
pub use eval::wer::{evaluate as evaluate_wer, WerReport};
pub use transcription::{AsrBackend, AudioSource, LoadedEngine, TranscriptionService};

use llm::SummaryService;
use meetings::MeetingStore;
use state::TranscriptionHandle;
use telemetry::TelemetryService;
use tracing_subscriber::EnvFilter;

#[cfg(target_os = "macos")]
use crate::audio_device::spawn_device_monitor;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if std::env::args().any(|arg| arg == "--print-system-audio-status") {
        // Headless probe: what the TCC preflight reports for System Audio
        // Recording for this app. `--out <file>` also writes it there, since
        // an app launched through `open` has no visible stdout.
        let status = format!("{:?}", speakers::system_audio_authorization());
        println!("{status}");
        let args: Vec<String> = std::env::args().collect();
        if let Some(path) = args.iter().position(|a| a == "--out").and_then(|i| args.get(i + 1)) {
            let _ = std::fs::write(path, &status);
        }
        std::process::exit(0);
    }

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
    let telemetry = TelemetryService::open_default();
    let telemetry_for_setup = telemetry.clone();
    let telemetry_for_exit = telemetry.clone();
    let meet_bridge = speakers::MeetBridge::new();
    meet_bridge.install_status_source();
    let meet_bridge_for_setup = meet_bridge.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(meeting_store.clone())
        .manage(summaries.clone())
        .manage(telemetry)
        .manage(TranscriptionHandle::new(
            meeting_store,
            summaries,
            meet_bridge,
        ))
        .setup(move |app| {
            telemetry_for_setup.track("app_opened", None);
            telemetry_for_setup.spawn_background_flusher();
            meet_bridge_for_setup.start_listening();
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
            commands::audio_device::get_default_input_device_command,
            commands::audio_device::list_audio_devices_command,
            commands::audio_device::set_audio_devices,
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
            commands::system_access::request_microphone_permission,
            commands::system_access::request_system_audio_permission,
            commands::system_audio_test::test_system_audio,
            commands::mcp::get_mcp_status,
            commands::updates::get_app_install_location,
            commands::onboarding::get_launch_flags,
            commands::onboarding::get_speech_model_status,
            commands::onboarding::start_speech_model_download,
            commands::telemetry::get_telemetry_settings,
            commands::telemetry::set_telemetry_enabled,
            commands::telemetry::track_telemetry_event,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let svc = telemetry_for_exit.clone();
            tauri::async_runtime::block_on(async move {
                let _ = tokio::time::timeout(std::time::Duration::from_millis(1500), svc.flush())
                    .await;
            });
        }
    });
}
