mod identity;
mod label;
pub mod meet_bridge;
mod meeting;
mod parse;
mod permission;
mod sink;
mod status;
mod teams;
mod timeline;
mod tree;
mod watch;
mod zoom;

pub use identity::app_identity;
pub use label::speaker_for_segment;
pub use meet_bridge::{GoogleMeetExtensionStatus, MeetBridge};
pub use permission::{
    is_main_thread, is_trusted, microphone_authorization, open_microphone_settings,
    open_privacy_settings, open_system_audio_settings, prompt, request_microphone_access,
    MicrophoneAuthorization,
};
pub use sink::SpeakerSink;
pub use status::{status, SpeakerTagsStatus};
pub use timeline::SpeakerTimeline;
pub use watch::{start as start_speaker_watch, SpeakerWatch};
