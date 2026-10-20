//! Google Meet extension speaker-tracking bridge (`meet_bridge`).
//! Meet tabs, meeting codes, heartbeat freshness, and which names to stamp.

use std::collections::{BTreeMap, BTreeSet};

use super::protocol::{
    sanitize_participants, CallState, ClientMessage, HeartbeatHealth, Participant, MAX_PARTICIPANTS,
};

/// A Google Meet tab is live only while its heartbeat is newer than this.
pub const STALE_AFTER_MS: u64 = 2_500;

#[derive(Debug, Clone)]
struct Tab {
    meeting_code: Option<String>,
    joined: bool,
    participants: Vec<Participant>,
    speaking: Vec<String>,
    last_seq: u64,
    last_heartbeat_ms: Option<u64>,
    last_speaking_change_ms: u64,
    last_observed_at: f64,
    health_status: String,
    health_reason: Option<String>,
}

impl Tab {
    fn new() -> Self {
        Self {
            meeting_code: None,
            joined: false,
            participants: Vec::new(),
            speaking: Vec::new(),
            last_seq: 0,
            last_heartbeat_ms: None,
            last_speaking_change_ms: 0,
            last_observed_at: 0.0,
            health_status: "ok".into(),
            health_reason: None,
        }
    }
}

#[derive(Debug, Clone)]
struct Connection {
    browser: String,
    extension_version: String,
    tabs: BTreeMap<String, Tab>,
}

#[derive(Debug, Default)]
pub struct Registry {
    connections: BTreeMap<u64, Connection>,
    next_id: u64,
    selected_meeting: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtensionSnapshot {
    pub connected: bool,
    pub browsers: Vec<String>,
    pub in_call_tabs: u32,
    pub extension_version: Option<String>,
    pub health: String,
}

impl Registry {
    pub fn connect(&mut self, browser: &str, extension_version: &str) -> u64 {
        self.next_id = self.next_id.saturating_add(1);
        let id = self.next_id;
        self.connections.insert(
            id,
            Connection {
                browser: sanitize_token(browser, 32),
                extension_version: sanitize_token(extension_version, 32),
                tabs: BTreeMap::new(),
            },
        );
        id
    }

    pub fn disconnect(&mut self, id: u64) {
        self.connections.remove(&id);
        let any_joined = self
            .connections
            .values()
            .any(|connection| connection.tabs.values().any(|tab| tab.joined));
        if !any_joined {
            self.selected_meeting = None;
        }
    }

    pub fn apply(&mut self, id: u64, message: ClientMessage, now_ms: u64) -> bool {
        let Some(connection) = self.connections.get_mut(&id) else {
            return false;
        };
        match message {
            ClientMessage::Hello { .. } => false,
            ClientMessage::Call {
                tab,
                state,
                meeting_code,
                observed_at,
            } => {
                if !tab_key_ok(&tab) {
                    return false;
                }
                match state {
                    CallState::Joined => {
                        let entry = connection.tabs.entry(tab).or_insert_with(Tab::new);
                        entry.joined = true;
                        entry.meeting_code = meeting_code.filter(|code| code.len() <= 64);
                        entry.last_observed_at = observed_at;
                        true
                    }
                    CallState::Left => {
                        connection.tabs.remove(&tab);
                        true
                    }
                }
            }
            ClientMessage::Roster { tab, participants } => {
                let Ok(participants) = sanitize_participants(participants) else {
                    tracing::warn!(
                        "meet_bridge dropped roster over {MAX_PARTICIPANTS} participants"
                    );
                    return false;
                };
                let Some(entry) = ensure_joined(connection, &tab) else {
                    return false;
                };
                entry.participants = participants;
                true
            }
            ClientMessage::Speakers {
                tab,
                seq,
                observed_at,
                speaking,
            } => apply_speaking(connection, &tab, seq, observed_at, speaking, now_ms, false),
            ClientMessage::Heartbeat {
                tab,
                seq,
                observed_at,
                speaking,
                health,
                ..
            } => {
                let applied =
                    apply_speaking(connection, &tab, seq, observed_at, speaking, now_ms, true);
                if let Some(entry) = connection.tabs.get_mut(&tab) {
                    entry.last_heartbeat_ms = Some(now_ms);
                    if let Some(health) = health {
                        apply_heartbeat_health(entry, &health);
                    }
                }
                applied
            }
            ClientMessage::Health {
                tab,
                status,
                reason,
            } => {
                let Some(entry) = ensure_joined(connection, &tab) else {
                    return false;
                };
                entry.health_status = if status == "degraded" {
                    "degraded".into()
                } else {
                    "ok".into()
                };
                entry.health_reason = reason.filter(|reason| reason.len() <= 128);
                true
            }
        }
    }

    pub fn is_live(&self, now_ms: u64) -> bool {
        self.connections.values().any(|connection| {
            connection
                .tabs
                .values()
                .any(|tab| tab_is_fresh(tab, now_ms))
        })
    }

    /// Remote display names for the selected Google Meet, with every tab's
    /// self name removed (including the same person joined on two browsers).
    pub fn selected_remote_names(&mut self, now_ms: u64) -> (BTreeSet<String>, f64) {
        let grouped = self.grouped_fresh_tabs(now_ms);
        if grouped.is_empty() {
            return (BTreeSet::new(), 0.0);
        }
        let chosen = choose_meeting(&grouped, self.selected_meeting.as_deref());
        self.selected_meeting = Some(chosen.clone());
        let tabs = &grouped[&chosen];
        let observed = tabs
            .iter()
            .map(|tab| tab.last_observed_at)
            .fold(0.0_f64, f64::max);
        (remote_names(tabs), observed)
    }

    pub fn snapshot(&self) -> ExtensionSnapshot {
        let mut browsers = BTreeSet::new();
        let mut versions = BTreeSet::new();
        let mut in_call_tabs = 0u32;
        let mut degraded = false;
        for connection in self.connections.values() {
            if !connection.browser.is_empty() {
                browsers.insert(connection.browser.clone());
            }
            if !connection.extension_version.is_empty() {
                versions.insert(connection.extension_version.clone());
            }
            for tab in connection.tabs.values() {
                if tab.joined {
                    in_call_tabs = in_call_tabs.saturating_add(1);
                }
                if tab.health_status == "degraded" {
                    degraded = true;
                }
            }
        }
        let connected = !self.connections.is_empty();
        ExtensionSnapshot {
            connected,
            browsers: browsers.into_iter().collect(),
            in_call_tabs,
            extension_version: if versions.is_empty() {
                None
            } else {
                Some(versions.into_iter().collect::<Vec<_>>().join(", "))
            },
            health: if !connected {
                "unknown".into()
            } else if degraded {
                "degraded".into()
            } else {
                "ok".into()
            },
        }
    }

    fn grouped_fresh_tabs(&self, now_ms: u64) -> BTreeMap<String, Vec<Tab>> {
        let mut grouped: BTreeMap<String, Vec<Tab>> = BTreeMap::new();
        for connection in self.connections.values() {
            for (key, tab) in &connection.tabs {
                if !tab_is_fresh(tab, now_ms) {
                    continue;
                }
                let group = tab
                    .meeting_code
                    .clone()
                    .filter(|code| !code.is_empty())
                    .unwrap_or_else(|| format!("tab:{key}"));
                grouped.entry(group).or_default().push(tab.clone());
            }
        }
        grouped
    }
}

fn ensure_joined<'a>(connection: &'a mut Connection, tab: &str) -> Option<&'a mut Tab> {
    if !tab_key_ok(tab) {
        return None;
    }
    let entry = connection
        .tabs
        .entry(tab.to_string())
        .or_insert_with(Tab::new);
    entry.joined = true;
    Some(entry)
}

fn apply_speaking(
    connection: &mut Connection,
    tab: &str,
    seq: u64,
    observed_at: f64,
    speaking: Vec<String>,
    now_ms: u64,
    refresh_heartbeat: bool,
) -> bool {
    if speaking.len() > MAX_PARTICIPANTS {
        return false;
    }
    let Some(entry) = ensure_joined(connection, tab) else {
        return false;
    };
    if refresh_heartbeat {
        entry.last_heartbeat_ms = Some(now_ms);
    }
    if seq <= entry.last_seq {
        return false;
    }
    entry.last_seq = seq;
    let speaking: Vec<String> = speaking
        .into_iter()
        .filter(|id| !id.is_empty() && id.len() <= 512)
        .collect();
    if speaking != entry.speaking {
        entry.speaking = speaking;
        entry.last_speaking_change_ms = now_ms;
    }
    entry.last_observed_at = observed_at;
    true
}

fn apply_heartbeat_health(tab: &mut Tab, health: &HeartbeatHealth) {
    if health.selectors.as_deref() == Some("discovered") {
        tab.health_status = "degraded".into();
        tab.health_reason = Some("meter-discovered".into());
    }
}

fn tab_is_fresh(tab: &Tab, now_ms: u64) -> bool {
    tab.joined
        && tab
            .last_heartbeat_ms
            .is_some_and(|seen| now_ms.saturating_sub(seen) < STALE_AFTER_MS)
}

fn choose_meeting(grouped: &BTreeMap<String, Vec<Tab>>, current: Option<&str>) -> String {
    if grouped.len() == 1 {
        return grouped.keys().next().unwrap().clone();
    }
    let newest = grouped
        .values()
        .map(|tabs| latest_change(tabs))
        .max()
        .unwrap_or(0);
    let mut tied: Vec<String> = grouped
        .iter()
        .filter(|(_, tabs)| latest_change(tabs) == newest)
        .map(|(key, _)| key.clone())
        .collect();
    if let Some(current) = current {
        if tied.iter().any(|key| key == current) {
            return current.to_string();
        }
    }
    tied.sort();
    tied.into_iter().next().unwrap_or_default()
}

fn latest_change(tabs: &[Tab]) -> u64 {
    tabs.iter()
        .map(|tab| tab.last_speaking_change_ms)
        .max()
        .unwrap_or(0)
}

fn remote_names(tabs: &[Tab]) -> BTreeSet<String> {
    let self_names: BTreeSet<&str> = tabs
        .iter()
        .flat_map(|tab| tab.participants.iter())
        .filter(|participant| participant.is_self)
        .map(|participant| participant.name.as_str())
        .filter(|name| !name.is_empty())
        .collect();
    let mut names = BTreeSet::new();
    for tab in tabs {
        for id in &tab.speaking {
            let Some(participant) = tab
                .participants
                .iter()
                .find(|participant| participant.id == *id)
            else {
                continue;
            };
            if participant.is_self || self_names.contains(participant.name.as_str()) {
                continue;
            }
            if participant.name.is_empty() {
                continue;
            }
            names.insert(participant.name.clone());
        }
    }
    names
}

fn tab_key_ok(tab: &str) -> bool {
    !tab.is_empty() && tab.len() <= 128 && !tab.chars().any(char::is_control)
}

fn sanitize_token(value: &str, max: usize) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || *ch == '.' || *ch == '-' || *ch == '_')
        .take(max)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speakers::meet_bridge::protocol::Participant;

    fn hello_browser(registry: &mut Registry, browser: &str) -> u64 {
        registry.connect(browser, "0.1.0")
    }

    fn participant(id: &str, name: &str, is_self: bool) -> Participant {
        Participant {
            id: id.into(),
            name: name.into(),
            is_self,
        }
    }

    fn join(registry: &mut Registry, conn: u64, tab: &str, code: &str, now: u64) {
        registry.apply(
            conn,
            ClientMessage::Call {
                tab: tab.into(),
                state: CallState::Joined,
                meeting_code: Some(code.into()),
                observed_at: now as f64,
            },
            now,
        );
    }

    fn roster(
        registry: &mut Registry,
        conn: u64,
        tab: &str,
        participants: Vec<Participant>,
        now: u64,
    ) {
        registry.apply(
            conn,
            ClientMessage::Roster {
                tab: tab.into(),
                participants,
            },
            now,
        );
    }

    fn beat(registry: &mut Registry, conn: u64, tab: &str, seq: u64, speaking: &[&str], now: u64) {
        registry.apply(
            conn,
            ClientMessage::Heartbeat {
                tab: tab.into(),
                seq,
                observed_at: now as f64,
                speaking: speaking.iter().map(|id| (*id).to_string()).collect(),
                visibility: Some("visible".into()),
                health: None,
            },
            now,
        );
    }

    #[test]
    fn self_is_removed_and_duplicate_meetings_merge() {
        let mut registry = Registry::default();
        let brave = hello_browser(&mut registry, "brave");
        let chrome = hello_browser(&mut registry, "chrome");
        join(&mut registry, brave, "b:1", "abc-defg-hij", 1_000);
        join(&mut registry, chrome, "c:2", "abc-defg-hij", 1_000);
        roster(
            &mut registry,
            brave,
            "b:1",
            vec![
                participant("spaces/a/devices/1", "Ada Lovelace", false),
                participant("spaces/a/devices/2", "Pavel Svitek", true),
            ],
            1_000,
        );
        roster(
            &mut registry,
            chrome,
            "c:2",
            vec![
                participant("spaces/a/devices/9", "Ada Lovelace", false),
                participant("spaces/a/devices/8", "Pavel Svitek", true),
            ],
            1_000,
        );
        beat(
            &mut registry,
            brave,
            "b:1",
            1,
            &["spaces/a/devices/1", "spaces/a/devices/2"],
            1_000,
        );
        beat(
            &mut registry,
            chrome,
            "c:2",
            1,
            &["spaces/a/devices/9"],
            1_000,
        );

        let (names, _) = registry.selected_remote_names(1_100);
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["Ada Lovelace"]);
        assert!(registry.is_live(1_100));
        assert!(!registry.is_live(1_000 + STALE_AFTER_MS));
    }

    #[test]
    fn a_second_devices_self_name_is_removed_from_the_other_tab() {
        let mut registry = Registry::default();
        let brave = hello_browser(&mut registry, "brave");
        let chrome = hello_browser(&mut registry, "chrome");
        join(&mut registry, brave, "b:1", "abc-defg-hij", 1_000);
        join(&mut registry, chrome, "c:2", "abc-defg-hij", 1_000);
        roster(
            &mut registry,
            brave,
            "b:1",
            vec![participant("dev-a", "Ada Lovelace", true)],
            1_000,
        );
        roster(
            &mut registry,
            chrome,
            "c:2",
            vec![participant("dev-p", "Pavel Svitek", true)],
            1_000,
        );
        beat(&mut registry, brave, "b:1", 1, &["dev-a"], 2_000);
        beat(&mut registry, chrome, "c:2", 1, &["dev-p"], 2_000);
        let (names, _) = registry.selected_remote_names(2_100);
        assert!(names.is_empty());
    }

    #[test]
    fn different_meetings_follow_the_latest_speaker_change() {
        let mut registry = Registry::default();
        let brave = hello_browser(&mut registry, "brave");
        join(&mut registry, brave, "b:1", "aaa-bbbb-ccc", 1_000);
        join(&mut registry, brave, "b:2", "ddd-eeee-fff", 1_000);
        roster(
            &mut registry,
            brave,
            "b:1",
            vec![
                participant("bob", "Bob", false),
                participant("grace", "Grace Hopper", false),
            ],
            1_000,
        );
        roster(
            &mut registry,
            brave,
            "b:2",
            vec![participant("cara", "Cara", false)],
            1_000,
        );
        beat(&mut registry, brave, "b:1", 1, &["bob"], 1_000);
        beat(&mut registry, brave, "b:2", 1, &[], 1_000);
        let (names, _) = registry.selected_remote_names(1_100);
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["Bob"]);

        beat(&mut registry, brave, "b:2", 2, &["cara"], 3_000);
        let (names, _) = registry.selected_remote_names(3_100);
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["Cara"]);

        beat(&mut registry, brave, "b:1", 2, &["grace"], 3_000);
        let (names, _) = registry.selected_remote_names(3_200);
        assert_eq!(
            names.into_iter().collect::<Vec<_>>(),
            vec!["Cara"],
            "a tie keeps the meeting already selected"
        );
    }

    #[test]
    fn older_sequence_numbers_do_not_rewind_speakers() {
        let mut registry = Registry::default();
        let conn = hello_browser(&mut registry, "chrome");
        join(&mut registry, conn, "c:1", "abc-defg-hij", 1_000);
        roster(
            &mut registry,
            conn,
            "c:1",
            vec![
                participant("ada", "Ada Lovelace", false),
                participant("grace", "Grace Hopper", false),
            ],
            1_000,
        );
        registry.apply(
            conn,
            ClientMessage::Speakers {
                tab: "c:1".into(),
                seq: 2,
                observed_at: 2_000.0,
                speaking: vec!["ada".into()],
            },
            2_000,
        );
        let ignored = registry.apply(
            conn,
            ClientMessage::Speakers {
                tab: "c:1".into(),
                seq: 1,
                observed_at: 2_100.0,
                speaking: vec!["grace".into()],
            },
            2_100,
        );
        assert!(!ignored);
        beat(&mut registry, conn, "c:1", 3, &["ada"], 2_200);
        let (names, _) = registry.selected_remote_names(2_300);
        assert_eq!(names.into_iter().collect::<Vec<_>>(), vec!["Ada Lovelace"]);
    }

    #[test]
    fn snapshot_lists_browsers_and_degraded_health() {
        let mut registry = Registry::default();
        let conn = hello_browser(&mut registry, "brave");
        join(&mut registry, conn, "b:1", "abc-defg-hij", 1_000);
        registry.apply(
            conn,
            ClientMessage::Health {
                tab: "b:1".into(),
                status: "degraded".into(),
                reason: Some("meter-discovered".into()),
            },
            1_000,
        );
        let snapshot = registry.snapshot();
        assert!(snapshot.connected);
        assert_eq!(snapshot.browsers, vec!["brave".to_string()]);
        assert_eq!(snapshot.in_call_tabs, 1);
        assert_eq!(snapshot.extension_version.as_deref(), Some("0.1.0"));
        assert_eq!(snapshot.health, "degraded");
        assert!(!registry.is_live(1_000));
    }
}
