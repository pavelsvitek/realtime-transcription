use serde::Serialize;

use super::meeting::running_meeting_app;
use super::permission;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerTagsStatus {
    pub trusted: bool,
    pub meeting_app: Option<String>,
}

pub fn status() -> SpeakerTagsStatus {
    SpeakerTagsStatus {
        trusted: permission::is_trusted(),
        meeting_app: running_meeting_app().map(|app| app.as_str().to_string()),
    }
}

pub fn request_permission() -> SpeakerTagsStatus {
    permission::prompt();
    permission::open_privacy_settings();
    status()
}
