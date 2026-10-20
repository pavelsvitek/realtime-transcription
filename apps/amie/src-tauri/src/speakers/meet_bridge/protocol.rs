//! Google Meet extension speaker-tracking bridge (`meet_bridge`).
//! Wire protocol v1 shared with Amie for Google Meet (`apps/chrome-meet-extension`).

use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_FRAME_BYTES: usize = 64 * 1024;
pub const MAX_NAME_CHARS: usize = 256;
pub const MAX_PARTICIPANTS: usize = 500;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientMessage {
    Hello {
        protocol: u32,
        extension_version: String,
        browser: String,
        instance_id: String,
    },
    Call {
        tab: String,
        state: CallState,
        #[serde(default)]
        meeting_code: Option<String>,
        observed_at: f64,
    },
    Roster {
        tab: String,
        participants: Vec<Participant>,
    },
    Speakers {
        tab: String,
        seq: u64,
        observed_at: f64,
        speaking: Vec<String>,
    },
    Heartbeat {
        tab: String,
        seq: u64,
        observed_at: f64,
        speaking: Vec<String>,
        #[serde(default)]
        visibility: Option<String>,
        #[serde(default)]
        health: Option<HeartbeatHealth>,
    },
    Health {
        tab: String,
        status: String,
        #[serde(default)]
        reason: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum CallState {
    Joined,
    Left,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
pub struct Participant {
    pub id: String,
    pub name: String,
    #[serde(rename = "self", default)]
    pub is_self: bool,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
pub struct HeartbeatHealth {
    #[serde(default)]
    pub meters: u32,
    #[serde(default)]
    pub last_meter_change_ms_ago: Option<u64>,
    #[serde(default)]
    pub selectors: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Welcome {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub protocol: u32,
    pub app_version: String,
    pub recording: bool,
    pub selectors: Option<SelectorOverride>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SelectorOverride {
    pub participant: String,
    pub meter: String,
    pub name: String,
    pub panel_row: String,
}

impl Welcome {
    pub fn new(app_version: impl Into<String>, recording: bool) -> Self {
        Self {
            kind: "welcome",
            protocol: PROTOCOL_VERSION,
            app_version: app_version.into(),
            recording,
            selectors: None,
        }
    }
}

pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Drop oversized names. A roster above the participant cap is refused whole.
pub fn sanitize_participants(
    participants: Vec<Participant>,
) -> Result<Vec<Participant>, &'static str> {
    if participants.len() > MAX_PARTICIPANTS {
        return Err("too many participants");
    }
    Ok(participants
        .into_iter()
        .filter(|participant| {
            !participant.id.is_empty()
                && participant.id.len() <= 512
                && participant.name.chars().count() <= MAX_NAME_CHARS
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> serde_json::Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../chrome-meet-extension/fixtures/meet_bridge/v1-frames.json");
        let text = std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("read {}: {error}", path.display()));
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn shared_fixture_parses_as_protocol_v1() {
        let fixture = fixture();
        for key in [
            "hello",
            "call_joined",
            "call_left",
            "roster",
            "speakers",
            "heartbeat",
            "health",
        ] {
            let message: ClientMessage = serde_json::from_value(fixture[key].clone())
                .unwrap_or_else(|error| panic!("{key}: {error}"));
            if key == "hello" {
                assert!(matches!(message, ClientMessage::Hello { protocol: 1, .. }));
            }
        }
        let hello: ClientMessage = serde_json::from_value(fixture["hello"].clone()).unwrap();
        assert!(matches!(
            hello,
            ClientMessage::Hello {
                protocol: 1,
                ref browser,
                ..
            } if browser == "brave"
        ));
        let welcome = Welcome::new("0.1.1", true);
        let json = serde_json::to_value(&welcome).unwrap();
        assert_eq!(json["type"], "welcome");
        assert_eq!(json["protocol"], 1);
        assert!(json["selectors"].is_null());
        let fixture_welcome = &fixture["welcome"];
        assert_eq!(fixture_welcome["type"], "welcome");
        assert_eq!(fixture_welcome["protocol"], 1);
    }

    #[test]
    fn long_names_and_huge_rosters_are_dropped() {
        let mut participants = vec![Participant {
            id: "spaces/a/devices/1".into(),
            name: "a".repeat(MAX_NAME_CHARS + 1),
            is_self: false,
        }];
        let kept = sanitize_participants(participants.clone()).unwrap();
        assert!(kept.is_empty());

        participants.clear();
        for index in 0..=MAX_PARTICIPANTS {
            participants.push(Participant {
                id: format!("id-{index}"),
                name: "Ada".into(),
                is_self: false,
            });
        }
        assert!(sanitize_participants(participants).is_err());
    }
}
