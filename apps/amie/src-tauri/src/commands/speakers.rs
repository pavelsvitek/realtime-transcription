use std::sync::mpsc;
use std::time::Duration;

use tauri::AppHandle;

use crate::speakers::{
    is_main_thread, open_privacy_settings, prompt, request_permission, status, SpeakerTagsStatus,
};

#[tauri::command]
pub fn get_speaker_tags_status() -> SpeakerTagsStatus {
    status()
}

/// Asks macOS for Accessibility, then opens the Privacy list. The dialog
/// itself has to be created on the main thread; a later call often has no
/// dialog, and the list is where Amie gets turned on.
#[tauri::command]
pub fn request_accessibility_permission(app: AppHandle) -> SpeakerTagsStatus {
    if is_main_thread() {
        return request_permission();
    }
    let (tx, rx) = mpsc::sync_channel(1);
    if app
        .run_on_main_thread(move || {
            prompt();
            let _ = tx.send(());
        })
        .is_ok()
    {
        let _ = rx.recv_timeout(Duration::from_secs(5));
    } else {
        prompt();
    }
    open_privacy_settings();
    status()
}
