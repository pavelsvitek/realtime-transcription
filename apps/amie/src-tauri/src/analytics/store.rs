//! `analytics.db`: events waiting to be sent, and MCP call counts per day.
//!
//! Kept apart from `meetings.db` so opting out can delete the whole file and
//! the MCP server can write counts without a meetings schema migration.

use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{Map, Value};

/// Oldest events are dropped past this, so a Mac that is never online
/// cannot grow the file without bound.
const MAX_QUEUED_EVENTS: i64 = 2_000;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    ts_ms INTEGER NOT NULL,
    data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_usage (
    day TEXT NOT NULL,
    client TEXT NOT NULL,
    tool TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, client, tool)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
";

#[derive(Debug, Clone, PartialEq)]
pub struct QueuedEvent {
    pub id: i64,
    pub name: String,
    pub ts_ms: i64,
    pub data: Map<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpUsageRow {
    pub day: String,
    pub client: String,
    pub tool: String,
    pub calls: i64,
    pub errors: i64,
}

pub struct Outbox {
    conn: Connection,
}

impl Outbox {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let conn = Connection::open(path).map_err(|err| err.to_string())?;
        // The app and the MCP server can write at the same moment.
        conn.busy_timeout(Duration::from_millis(2_000))
            .map_err(|err| err.to_string())?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|err| err.to_string())?;
        conn.execute_batch(SCHEMA).map_err(|err| err.to_string())?;
        Ok(Self { conn })
    }

    pub fn push_event(
        &self,
        name: &str,
        ts_ms: i64,
        data: &Map<String, Value>,
    ) -> Result<(), String> {
        let data = serde_json::to_string(data).map_err(|err| err.to_string())?;
        self.conn
            .execute(
                "INSERT INTO events (name, ts_ms, data) VALUES (?1, ?2, ?3)",
                params![name, ts_ms, data],
            )
            .map_err(|err| err.to_string())?;
        self.conn
            .execute(
                "DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?1",
                params![MAX_QUEUED_EVENTS],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    pub fn peek_events(&self, limit: usize) -> Result<Vec<QueuedEvent>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, name, ts_ms, data FROM events ORDER BY id LIMIT ?1")
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![limit as i64], |row| {
                let data: String = row.get(3)?;
                Ok(QueuedEvent {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    ts_ms: row.get(2)?,
                    data: serde_json::from_str(&data).unwrap_or_default(),
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn delete_events(&self, ids: impl IntoIterator<Item = i64>) -> Result<(), String> {
        let mut stmt = self
            .conn
            .prepare("DELETE FROM events WHERE id = ?1")
            .map_err(|err| err.to_string())?;
        for id in ids {
            stmt.execute(params![id]).map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    pub fn add_mcp_call(
        &self,
        day: &str,
        client: &str,
        tool: &str,
        ok: bool,
    ) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO mcp_usage (day, client, tool, calls, errors) VALUES (?1, ?2, ?3, 1, ?4)
                 ON CONFLICT (day, client, tool) DO UPDATE SET
                     calls = calls + 1,
                     errors = errors + excluded.errors",
                params![day, client, tool, i64::from(!ok)],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    /// Finished days only: today's counts are still growing.
    pub fn peek_mcp_days_before(
        &self,
        day: &str,
        limit: usize,
    ) -> Result<Vec<McpUsageRow>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT day, client, tool, calls, errors FROM mcp_usage
                 WHERE day < ?1 ORDER BY day, client, tool LIMIT ?2",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![day, limit as i64], |row| {
                Ok(McpUsageRow {
                    day: row.get(0)?,
                    client: row.get(1)?,
                    tool: row.get(2)?,
                    calls: row.get(3)?,
                    errors: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<_, _>>()
            .map_err(|err| err.to_string())
    }

    pub fn delete_mcp(&self, rows: &[McpUsageRow]) -> Result<(), String> {
        let mut stmt = self
            .conn
            .prepare("DELETE FROM mcp_usage WHERE day = ?1 AND client = ?2 AND tool = ?3")
            .map_err(|err| err.to_string())?;
        for row in rows {
            stmt.execute(params![row.day, row.client, row.tool])
                .map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    fn meta(&self, key: &str) -> Result<Option<String>, String> {
        self.conn
            .query_row(
                "SELECT value FROM meta WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|err| err.to_string())
    }

    fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
        self.conn
            .execute(
                "INSERT INTO meta (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map_err(|err| err.to_string())?;
        Ok(())
    }

    /// The UTC day `app_active` was last queued for.
    pub fn active_day(&self) -> Result<Option<String>, String> {
        self.meta("active_day")
    }

    pub fn set_active_day(&self, day: &str) -> Result<(), String> {
        self.set_meta("active_day", day)
    }

    /// The install properties last sent with `identify`.
    pub fn identified_as(&self) -> Result<Option<String>, String> {
        self.meta("identified_as")
    }

    pub fn set_identified_as(&self, key: &str) -> Result<(), String> {
        self.set_meta("identified_as", key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outbox(dir: &tempfile::TempDir) -> Outbox {
        Outbox::open(&dir.path().join("analytics.db")).unwrap()
    }

    #[test]
    fn events_come_back_in_order_and_can_be_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let outbox = outbox(&dir);
        let mut data = Map::new();
        data.insert("duration_s".into(), 90.into());
        outbox.push_event("a", 1, &data).unwrap();
        outbox.push_event("b", 2, &Map::new()).unwrap();

        let events = outbox.peek_events(10).unwrap();
        assert_eq!(
            events.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            ["a", "b"]
        );
        assert_eq!(events[0].data["duration_s"], 90);

        outbox.delete_events([events[0].id]).unwrap();
        assert_eq!(outbox.peek_events(10).unwrap()[0].name, "b");
    }

    #[test]
    fn queue_is_capped() {
        let dir = tempfile::tempdir().unwrap();
        let outbox = outbox(&dir);
        for i in 0..(MAX_QUEUED_EVENTS + 5) {
            outbox.push_event(&format!("e{i}"), i, &Map::new()).unwrap();
        }
        let events = outbox.peek_events(usize::MAX >> 1).unwrap();
        assert_eq!(events.len() as i64, MAX_QUEUED_EVENTS);
        assert_eq!(events[0].name, "e5");
    }

    #[test]
    fn mcp_calls_add_up_and_only_past_days_are_ready() {
        let dir = tempfile::tempdir().unwrap();
        let outbox = outbox(&dir);
        outbox
            .add_mcp_call("2026-11-11", "claude-code", "get_meeting", true)
            .unwrap();
        outbox
            .add_mcp_call("2026-11-11", "claude-code", "get_meeting", false)
            .unwrap();
        outbox
            .add_mcp_call("2026-11-12", "cursor", "list_meetings", true)
            .unwrap();

        let ready = outbox.peek_mcp_days_before("2026-11-12", 10).unwrap();
        assert_eq!(
            ready,
            vec![McpUsageRow {
                day: "2026-11-11".into(),
                client: "claude-code".into(),
                tool: "get_meeting".into(),
                calls: 2,
                errors: 1,
            }]
        );
        outbox.delete_mcp(&ready).unwrap();
        assert!(outbox
            .peek_mcp_days_before("2026-11-12", 10)
            .unwrap()
            .is_empty());
        assert_eq!(
            outbox.peek_mcp_days_before("2026-11-13", 10).unwrap().len(),
            1
        );
    }
}
