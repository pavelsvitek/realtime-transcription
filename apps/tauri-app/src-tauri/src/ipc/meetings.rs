use serde::Serialize;

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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingRecord {
    pub meeting: MeetingDetail,
    pub segments: Vec<MeetingSegment>,
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
}
