use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptPartial {
    pub speaker: String,
    pub stream: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub segment_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptCommit {
    pub speaker: String,
    pub stream: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub segment_id: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionStatus {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Point-in-time capture of the in-process session, used to restore the live
/// UI after navigating away from Transcription.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionSnapshot {
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub loading: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meeting_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MicLevel {
    pub rms: f32,
    /// The meeting app's mute button is on, so this stream is silence by design.
    /// Always `false` on the system-audio meter.
    pub muted: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevicePayload {
    pub device: crate::audio_device::AudioDeviceInfo,
}

/// Full session transcript returned on stop or export.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptExport {
    pub text: String,
    pub word_count: usize,
    pub speaker: String,
    pub stream: String,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meeting_id: Option<String>,
}

#[derive(Debug, Clone)]
pub enum TranscriptEvent {
    Partial(TranscriptPartial),
    Commit(TranscriptCommit),
    Status(TranscriptionStatus),
    MicLevel(MicLevel),
    /// System-audio RMS. Same payload as the mic meter, on its own event so the
    /// mic icon stays tied to the microphone.
    SystemLevel(MicLevel),
    Device(AudioDevicePayload),
}

pub mod event_names {
    // Tauri 2 allows alphanumeric, '-', '/', ':', '_' — not '.'
    pub const PARTIAL: &str = "transcript/partial";
    pub const COMMIT: &str = "transcript/commit";
    pub const STATUS: &str = "transcription/status";
    pub const MIC_LEVEL: &str = "transcription/mic_level";
    pub const SYSTEM_LEVEL: &str = "transcription/system_level";
    pub const DEVICE: &str = "transcription/device";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn partial_serializes_with_camel_case_fields() {
        let partial = TranscriptPartial {
            speaker: "User".into(),
            stream: "mic".into(),
            text: "hello".into(),
            start_ms: 100,
            end_ms: 500,
            segment_id: "seg-1".into(),
        };

        let json = serde_json::to_value(&partial).unwrap();
        assert_eq!(json["speaker"], "User");
        assert_eq!(json["stream"], "mic");
        assert_eq!(json["text"], "hello");
        assert_eq!(json["startMs"], 100);
        assert_eq!(json["endMs"], 500);
        assert_eq!(json["segmentId"], "seg-1");
        assert!(json.get("start_ms").is_none(), "should use camelCase");
    }

    #[test]
    fn commit_serializes_with_camel_case_fields() {
        let commit = TranscriptCommit {
            speaker: "User".into(),
            stream: "mic".into(),
            text: "hello world".into(),
            start_ms: 100,
            end_ms: 1200,
            segment_id: "seg-1".into(),
        };

        let json = serde_json::to_value(&commit).unwrap();
        assert_eq!(json["segmentId"], "seg-1");
        assert_eq!(json["startMs"], 100);
        assert_eq!(json["endMs"], 1200);
    }

    #[test]
    fn status_omits_none_fields() {
        let status = TranscriptionStatus {
            active: true,
            loading: None,
            model: None,
            error: None,
        };

        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["active"], true);
        assert!(json.get("loading").is_none());
        assert!(json.get("model").is_none());
        assert!(json.get("error").is_none());
    }

    #[test]
    fn status_includes_present_fields() {
        let status = TranscriptionStatus {
            active: false,
            loading: Some(true),
            model: Some("Nemotron 3.5 ASR Streaming 0.6B CoreML INT8".into()),
            error: None,
        };

        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["active"], false);
        assert_eq!(json["loading"], true);
        assert_eq!(json["model"], "Nemotron 3.5 ASR Streaming 0.6B CoreML INT8");
        assert!(json.get("error").is_none());
    }

    #[test]
    fn snapshot_serializes_camel_case_session_fields() {
        let snapshot = TranscriptionSnapshot {
            active: true,
            loading: None,
            model: Some("xAI Transcribe 2.0".into()),
            error: None,
            source: Some("both".into()),
            backend: Some("xai".into()),
            meeting_id: Some("m1".into()),
        };
        let json = serde_json::to_value(&snapshot).unwrap();
        assert_eq!(json["active"], true);
        assert_eq!(json["model"], "xAI Transcribe 2.0");
        assert_eq!(json["source"], "both");
        assert_eq!(json["backend"], "xai");
        assert_eq!(json["meetingId"], "m1");
        assert!(json.get("meeting_id").is_none());
        assert!(json.get("loading").is_none());
    }

    #[test]
    fn export_includes_meeting_id() {
        let export = TranscriptExport {
            text: "hello".into(),
            word_count: 1,
            speaker: "User".into(),
            stream: "mic".into(),
            source: "mic".into(),
            meeting_id: Some("m1".into()),
        };
        let json = serde_json::to_value(&export).unwrap();
        assert_eq!(json["meetingId"], "m1");
        assert!(json.get("meeting_id").is_none());
    }
}
