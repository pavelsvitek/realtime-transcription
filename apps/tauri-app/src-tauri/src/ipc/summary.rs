use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SummaryJobState {
    Idle,
    Running,
    Done,
    Error,
}

impl SummaryJobState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::Done => "done",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryDelta {
    pub meeting_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryStatus {
    pub meeting_id: String,
    pub state: SummaryJobState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryJobSnapshot {
    pub state: SummaryJobState,
    pub draft: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl SummaryJobSnapshot {
    pub fn idle() -> Self {
        Self {
            state: SummaryJobState::Idle,
            draft: String::new(),
            error: None,
        }
    }
}

pub mod event_names {
    pub const DELTA: &str = "summary/delta";
    pub const STATUS: &str = "summary/status";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn delta_serializes_camel_case_accumulated_text() {
        let delta = SummaryDelta {
            meeting_id: "m1".into(),
            text: "- **Ship** it".into(),
        };
        let json = serde_json::to_value(&delta).unwrap();
        assert_eq!(json["meetingId"], "m1");
        assert_eq!(json["text"], "- **Ship** it");
        assert!(json.get("meeting_id").is_none());
    }

    #[test]
    fn status_omits_error_when_none() {
        let status = SummaryStatus {
            meeting_id: "m1".into(),
            state: SummaryJobState::Running,
            error: None,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["state"], "running");
        assert!(json.get("error").is_none());
    }

    #[test]
    fn snapshot_serializes_idle() {
        let json = serde_json::to_value(SummaryJobSnapshot::idle()).unwrap();
        assert_eq!(json["state"], "idle");
        assert_eq!(json["draft"], "");
        assert!(json.get("error").is_none());
    }
}
