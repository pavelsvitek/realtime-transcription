use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::AppError;
use crate::ipc::meetings::{MeetingDetail, MeetingListItem, MeetingRecord, MeetingSegment};

const APP_SUPPORT_DIR: &str = "com.pavel.tauri-app";
const DB_FILE: &str = "meetings.db";
const SCHEMA_VERSION: i64 = 1;
const DEVICE_ID_KEY: &str = "device_id";

const MIGRATION_V1: &str = r#"
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    title TEXT NOT NULL,
    teaser TEXT,
    summary TEXT,
    status TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    last_writer_device_id TEXT
);

CREATE INDEX IF NOT EXISTS meetings_list_idx
    ON meetings (status, deleted_at, started_at);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    meeting_id TEXT NOT NULL REFERENCES meetings(id),
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    last_writer_device_id TEXT
);

CREATE INDEX IF NOT EXISTS segments_meeting_idx
    ON transcript_segments (meeting_id, start_ms, id);

CREATE TABLE IF NOT EXISTS sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op_id TEXT NOT NULL UNIQUE,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    op TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"#;

#[derive(Clone)]
pub struct MeetingStore {
    conn: Arc<Mutex<Connection>>,
    device_id: String,
    path: PathBuf,
}

impl MeetingStore {
    pub fn open_default() -> Result<Self, AppError> {
        Self::open(&default_db_path())
    }

    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(path).map_err(store_err)?;
        conn.busy_timeout(std::time::Duration::from_millis(5_000))
            .map_err(store_err)?;
        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(store_err)?;
        conn.pragma_update(None, "foreign_keys", "ON")
            .map_err(store_err)?;

        migrate(&conn)?;
        let device_id = load_or_create_device_id(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            device_id,
            path: path.to_path_buf(),
        })
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn insert_live_meeting(&self, id: &str, started_at: i64, title: &str) -> Result<(), AppError> {
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meetings (
                id, started_at, finished_at, title, teaser, summary, status,
                updated_at, deleted_at, revision, last_writer_device_id
            ) VALUES (?1, ?2, NULL, ?3, NULL, NULL, 'live', ?4, NULL, 1, ?5)",
            params![id, started_at, title, now, self.device_id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    /// Mark leftover `live` rows finished (crash / killed-app recovery).
    pub fn finish_open_meetings(&self, finished_at: i64) -> Result<usize, AppError> {
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE meetings
                 SET status = 'finished',
                     finished_at = COALESCE(finished_at, ?1),
                     updated_at = ?2,
                     revision = revision + 1
                 WHERE status = 'live' AND deleted_at IS NULL",
                params![finished_at, now],
            )
            .map_err(store_err)?;
        Ok(changed)
    }

    pub fn insert_segment(
        &self,
        id: &str,
        meeting_id: &str,
        start_ms: i64,
        end_ms: i64,
        text: &str,
    ) -> Result<(), AppError> {
        if text.is_empty() {
            return Ok(());
        }
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO transcript_segments (
                id, meeting_id, start_ms, end_ms, text,
                updated_at, deleted_at, revision, last_writer_device_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 1, ?7)",
            params![id, meeting_id, start_ms, end_ms, text, now, self.device_id],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn finish_meeting(&self, id: &str, finished_at: i64) -> Result<(), AppError> {
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE meetings
                 SET status = 'finished',
                     finished_at = ?1,
                     updated_at = ?2,
                     revision = revision + 1
                 WHERE id = ?3 AND deleted_at IS NULL",
                params![finished_at, now, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store(format!("meeting {id} not found")));
        }
        Ok(())
    }

    pub fn list_finished(&self) -> Result<Vec<MeetingListItem>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, started_at, title, teaser
                 FROM meetings
                 WHERE status = 'finished' AND deleted_at IS NULL
                 ORDER BY started_at DESC",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map([], |row| {
                Ok(MeetingListItem {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    title: row.get(2)?,
                    teaser: row.get(3)?,
                })
            })
            .map_err(store_err)?;

        let mut items = Vec::new();
        for row in rows {
            items.push(row.map_err(store_err)?);
        }
        Ok(items)
    }

    pub fn get_record(&self, id: &str) -> Result<MeetingRecord, AppError> {
        let conn = self.conn.lock().unwrap();
        let meeting = conn
            .query_row(
                "SELECT id, started_at, finished_at, title, teaser, summary, status
                 FROM meetings
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                |row| {
                    Ok(MeetingDetail {
                        id: row.get(0)?,
                        started_at: row.get(1)?,
                        finished_at: row.get(2)?,
                        title: row.get(3)?,
                        teaser: row.get(4)?,
                        summary: row.get(5)?,
                        status: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(store_err)?
            .ok_or_else(|| AppError::Store("Meeting not found".into()))?;

        let mut stmt = conn
            .prepare(
                "SELECT id, start_ms, end_ms, text
                 FROM transcript_segments
                 WHERE meeting_id = ?1 AND deleted_at IS NULL
                 ORDER BY start_ms ASC, id ASC",
            )
            .map_err(store_err)?;
        let rows = stmt
            .query_map(params![id], |row| {
                Ok(MeetingSegment {
                    id: row.get(0)?,
                    start_ms: row.get(1)?,
                    end_ms: row.get(2)?,
                    text: row.get(3)?,
                })
            })
            .map_err(store_err)?;

        let mut segments = Vec::new();
        for row in rows {
            segments.push(row.map_err(store_err)?);
        }

        Ok(MeetingRecord { meeting, segments })
    }
}

pub fn default_db_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home)
        .join("Library/Application Support")
        .join(APP_SUPPORT_DIR)
        .join(DB_FILE)
}

pub fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn migrate(conn: &Connection) -> Result<(), AppError> {
    let current: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current >= SCHEMA_VERSION {
        return Ok(());
    }

    conn.execute_batch(MIGRATION_V1).map_err(store_err)?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
        params![SCHEMA_VERSION, now_ms()],
    )
    .map_err(store_err)?;
    Ok(())
}

fn load_or_create_device_id(conn: &Connection) -> Result<String, AppError> {
    let existing: Option<String> = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = ?1",
            params![DEVICE_ID_KEY],
            |row| row.get(0),
        )
        .optional()
        .map_err(store_err)?;

    if let Some(id) = existing {
        return Ok(id);
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)",
        params![DEVICE_ID_KEY, id],
    )
    .map_err(store_err)?;
    Ok(id)
}

fn store_err(err: rusqlite::Error) -> AppError {
    AppError::Store(err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> MeetingStore {
        let dir = std::env::temp_dir().join(format!("meetings-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        MeetingStore::open(&dir.join("meetings.db")).unwrap()
    }

    #[test]
    fn live_meeting_has_null_finished_at_then_stop_sets_it() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();

        let live = store.get_record("m1").unwrap();
        assert_eq!(live.meeting.status, "live");
        assert_eq!(live.meeting.finished_at, None);
        assert!(store.list_finished().unwrap().is_empty());

        store.finish_meeting("m1", 2_000).unwrap();
        let finished = store.get_record("m1").unwrap();
        assert_eq!(finished.meeting.status, "finished");
        assert_eq!(finished.meeting.finished_at, Some(2_000));

        let list = store.list_finished().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "m1");
        assert_eq!(list[0].started_at, 1_000);
    }

    #[test]
    fn segments_order_by_start_ms_and_skip_empty_text() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "Call").unwrap();
        store.insert_segment("s2", "m1", 400, 800, "second").unwrap();
        store.insert_segment("s1", "m1", 0, 300, "first").unwrap();
        store.insert_segment("s0", "m1", 10, 20, "").unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        let record = store.get_record("m1").unwrap();
        let texts: Vec<_> = record.segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["first", "second"]);
    }

    #[test]
    fn two_meetings_can_reuse_asr_segment_ids() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "First").unwrap();
        store.insert_live_meeting("m2", 2_000, "Second").unwrap();
        store
            .insert_segment("m1:seg-0", "m1", 0, 100, "hello")
            .unwrap();
        store
            .insert_segment("m2:seg-0", "m2", 0, 100, "world")
            .unwrap();
        store.finish_meeting("m1", 1_500).unwrap();
        store.finish_meeting("m2", 2_500).unwrap();

        let first = store.get_record("m1").unwrap();
        let second = store.get_record("m2").unwrap();
        assert_eq!(first.segments[0].text, "hello");
        assert_eq!(second.segments[0].text, "world");
    }

    #[test]
    fn finish_open_meetings_closes_stale_live_rows() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "Stuck").unwrap();
        assert_eq!(store.finish_open_meetings(2_000).unwrap(), 1);
        let row = store.get_record("m1").unwrap();
        assert_eq!(row.meeting.status, "finished");
        assert_eq!(row.meeting.finished_at, Some(2_000));
    }

    #[test]
    fn default_path_uses_app_support() {
        let path = default_db_path();
        let s = path.to_string_lossy();
        assert!(s.contains(APP_SUPPORT_DIR));
        assert!(s.ends_with(DB_FILE));
    }
}
