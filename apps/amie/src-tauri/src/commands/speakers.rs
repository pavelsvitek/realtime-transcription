use std::sync::mpsc;
use std::time::Duration;

use tauri::AppHandle;

use crate::speakers::{
    is_main_thread, is_trusted, open_privacy_settings, prompt, status, SpeakerTagsStatus,
};

/// Async so the process lookups run off the main thread; the page polls this
/// while Accessibility is off.
#[tauri::command(async)]
pub fn get_speaker_tags_status() -> SpeakerTagsStatus {
    status()
}

/// Asks macOS for Accessibility and opens the Privacy list.
///
/// Already trusted: nothing to ask. The prompt is what makes this build show
/// up in the list, and the dialog has to be created on the main thread. macOS
/// shows it once per entry, so the Privacy list is opened too.
///
/// This never deletes the entry (`tccutil reset`). The process caches its
/// "not trusted" answer, so a prompt after a reset never reaches the system:
/// the entry vanished from the list and nothing put it back until a relaunch.
#[tauri::command(async)]
pub fn request_accessibility_permission(app: AppHandle) -> SpeakerTagsStatus {
    if is_trusted() {
        return status();
    }
    prompt_on_main_thread(&app);
    open_privacy_settings();
    status()
}

fn prompt_on_main_thread(app: &AppHandle) {
    if is_main_thread() {
        prompt();
        return;
    }
    let (tx, rx) = mpsc::sync_channel(1);
    let queued = app.run_on_main_thread(move || {
        prompt();
        let _ = tx.send(());
    });
    match queued {
        Ok(()) => {
            let _ = rx.recv_timeout(Duration::from_secs(5));
        }
        Err(_) => prompt(),
    }
}
