use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingListItem {
    pub id: String,
    pub started_at: i64,
    pub title: String,
    pub teaser: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingDetail {
    pub id: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub title: String,
    pub teaser: Option<String>,
    pub summary: Option<String>,
    pub status: String,
    pub context: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSegment {
    pub id: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    /// "User" or "Remote". Empty on rows saved before this column existed.
    pub speaker: String,
    /// "mic" or "system". Empty on rows saved before this column existed.
    pub stream: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRecord {
    pub meeting: MeetingDetail,
    pub segments: Vec<MeetingSegment>,
}

/// Optional Meeting fields. Omitted keys are left unchanged.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchMeeting {
    pub title: Option<String>,
    pub context: Option<String>,
    pub summary: Option<String>,
    pub archived_at: Option<i64>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_item_serializes_camel_case() {
        let item = MeetingListItem {
            id: "m1".into(),
            started_at: 1_000,
            title: "POC".into(),
            teaser: Some("scope".into()),
        };
        let json = serde_json::to_value(&item).unwrap();
        assert_eq!(json["startedAt"], 1_000);
        assert!(json.get("started_at").is_none());
    }

    #[test]
    fn detail_serializes_context() {
        let detail = MeetingDetail {
            id: "m1".into(),
            started_at: 1_000,
            finished_at: None,
            title: "POC".into(),
            teaser: None,
            summary: None,
            status: "live".into(),
            context: Some("Pavel, Igor".into()),
        };
        let json = serde_json::to_value(&detail).unwrap();
        assert_eq!(json["context"], "Pavel, Igor");
        assert_eq!(json["status"], "live");
    }

    #[test]
    fn patch_deserializes_optional_camel_case_keys() {
        let title_only: PatchMeeting =
            serde_json::from_value(serde_json::json!({ "title": "Weekly sync" })).unwrap();
        assert_eq!(title_only.title.as_deref(), Some("Weekly sync"));
        assert!(title_only.context.is_none());
        assert!(title_only.summary.is_none());
        assert!(title_only.archived_at.is_none());

        let context_and_archive: PatchMeeting = serde_json::from_value(serde_json::json!({
            "context": "",
            "archivedAt": 1_700_000_000_000i64
        }))
        .unwrap();
        assert_eq!(context_and_archive.context.as_deref(), Some(""));
        assert_eq!(context_and_archive.archived_at, Some(1_700_000_000_000));
        assert!(context_and_archive.title.is_none());
        assert!(context_and_archive.summary.is_none());

        let summary_only: PatchMeeting =
            serde_json::from_value(serde_json::json!({ "summary": "Prev notes" })).unwrap();
        assert_eq!(summary_only.summary.as_deref(), Some("Prev notes"));
        assert!(summary_only.context.is_none());
    }
}
