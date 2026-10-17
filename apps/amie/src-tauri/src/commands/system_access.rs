use serde::Serialize;
use tauri::AppHandle;

use crate::speakers::{
    is_main_thread, is_trusted, microphone_authorization, open_microphone_settings,
    open_privacy_settings, open_system_audio_settings, prompt, request_microphone_access,
    status, MicrophoneAuthorization, SpeakerTagsStatus,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAccessStatus {
    pub microphone: MicrophoneAuthorization,
    /// Loopback has no public “is granted” API; UI shows guidance + Settings deep link.
    pub system_audio: SystemAudioAccess,
    pub accessibility: SpeakerTagsStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SystemAudioAccess {
    /// Cannot query TCC for `AudioCapture` from userland; open System Settings to review.
    ReviewInSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SystemAccessPane {
    Microphone,
    SystemAudio,
    Accessibility,
}

impl SystemAccessPane {
    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "microphone" | "mic" => Some(Self::Microphone),
            "systemAudio" | "system_audio" | "audio" => Some(Self::SystemAudio),
            "accessibility" | "ax" => Some(Self::Accessibility),
            _ => None,
        }
    }
}

#[tauri::command(async)]
pub fn get_system_access_status() -> SystemAccessStatus {
    SystemAccessStatus {
        microphone: microphone_authorization(),
        system_audio: SystemAudioAccess::ReviewInSettings,
        accessibility: status(),
    }
}

/// Opens the matching Privacy pane. For Accessibility / Microphone, also
/// triggers the system prompt when the grant is still missing.
#[tauri::command(async)]
pub fn open_system_access_settings(app: AppHandle, pane: String) -> Result<SystemAccessStatus, String> {
    let pane = SystemAccessPane::parse(&pane).ok_or_else(|| format!("Unknown pane: {pane}"))?;
    match pane {
        SystemAccessPane::Microphone => {
            if matches!(
                microphone_authorization(),
                MicrophoneAuthorization::NotDetermined
            ) {
                request_microphone_on_main_thread(&app);
            }
            open_microphone_settings();
        }
        SystemAccessPane::SystemAudio => {
            open_system_audio_settings();
        }
        SystemAccessPane::Accessibility => {
            if !is_trusted() {
                prompt_accessibility_on_main_thread(&app);
            }
            open_privacy_settings();
        }
    }
    Ok(get_system_access_status())
}

fn request_microphone_on_main_thread(app: &AppHandle) {
    run_on_main_thread(app, request_microphone_access);
}

fn prompt_accessibility_on_main_thread(app: &AppHandle) {
    run_on_main_thread(app, prompt);
}

fn run_on_main_thread(app: &AppHandle, work: fn()) {
    use std::sync::mpsc;
    use std::time::Duration;

    if is_main_thread() {
        work();
        return;
    }
    let (tx, rx) = mpsc::sync_channel(1);
    let queued = app.run_on_main_thread(move || {
        work();
        let _ = tx.send(());
    });
    match queued {
        Ok(()) => {
            let _ = rx.recv_timeout(Duration::from_secs(5));
        }
        Err(_) => work(),
    }
}
