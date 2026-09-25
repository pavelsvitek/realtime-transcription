use crate::speakers::{request_permission, status, SpeakerTagsStatus};

#[tauri::command]
pub fn get_speaker_tags_status() -> SpeakerTagsStatus {
    status()
}

/// Shows the system Accessibility prompt. Synchronous commands run on the
/// main thread, which is where AppKit presents that dialog.
#[tauri::command]
pub fn request_accessibility_permission() -> SpeakerTagsStatus {
    request_permission()
}
