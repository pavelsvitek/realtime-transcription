use serde::Serialize;

use super::identity::{app_identity, SignatureKind};
use super::meet_bridge::{installed_status, GoogleMeetExtensionStatus};
use super::meeting::running_meeting_app;
use super::permission;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerTagsStatus {
    pub trusted: bool,
    pub meeting_app: Option<String>,
    /// The name System Settings lists, e.g. "Amie" or "Amie Dev".
    pub build_label: String,
    pub bundle_path: Option<String>,
    pub bundle_id: Option<String>,
    pub signature: SignatureKind,
    pub signer: Option<String>,
    /// Designated requirement for this binary (TCC identity), when known.
    pub code_requirement: Option<String>,
    /// Google Meet Chrome extension speaker-tracking (`meet_bridge`), when a DEV build is listening.
    pub google_meet_extension: GoogleMeetExtensionStatus,
}

pub fn status() -> SpeakerTagsStatus {
    let identity = app_identity();
    SpeakerTagsStatus {
        trusted: permission::is_trusted(),
        meeting_app: running_meeting_app().map(|app| app.as_str().to_string()),
        build_label: identity.label.clone(),
        bundle_path: identity
            .bundle_path
            .as_ref()
            .map(|path| path.display().to_string()),
        bundle_id: identity.bundle_id.clone(),
        signature: identity.signature.kind,
        signer: identity.signature.signer.clone(),
        code_requirement: identity.signature.requirement.clone(),
        google_meet_extension: installed_status(),
    }
}
