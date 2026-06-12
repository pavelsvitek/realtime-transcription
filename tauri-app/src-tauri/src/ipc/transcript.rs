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

#[derive(Debug, Clone, Serialize)]
pub struct MicLevel {
    pub rms: f32,
}

#[derive(Debug, Clone)]
pub enum TranscriptEvent {
    Partial(TranscriptPartial),
    Commit(TranscriptCommit),
    Status(TranscriptionStatus),
    MicLevel(MicLevel),
}

pub mod event_names {
    pub const PARTIAL: &str = "transcript.partial";
    pub const COMMIT: &str = "transcript.commit";
    pub const STATUS: &str = "transcription.status";
    pub const MIC_LEVEL: &str = "transcription.mic_level";
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
            model: Some("ggml-small.en".into()),
            error: None,
        };

        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["active"], false);
        assert_eq!(json["loading"], true);
        assert_eq!(json["model"], "ggml-small.en");
        assert!(json.get("error").is_none());
    }
}
