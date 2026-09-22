use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::AppError;
use crate::ipc::meetings::{
    MeetingDetail, MeetingListItem, MeetingRecord, MeetingSegment, PatchMeeting,
};

const APP_SUPPORT_DIR: &str = "com.pavel.amie";
const DB_FILE: &str = "meetings.db";
const SCHEMA_VERSION: i64 = 4;
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

const MIGRATION_V2: &str = r#"
ALTER TABLE meetings ADD COLUMN archived_at INTEGER;

CREATE INDEX IF NOT EXISTS meetings_list_archived_idx
    ON meetings (status, deleted_at, archived_at, started_at);
"#;

const MIGRATION_V3: &str = r#"
ALTER TABLE meetings ADD COLUMN context TEXT;
"#;

const MIGRATION_V4_SPEAKER: &str = r#"
ALTER TABLE transcript_segments ADD COLUMN speaker TEXT NOT NULL DEFAULT '';
"#;

const MIGRATION_V4_STREAM: &str = r#"
ALTER TABLE transcript_segments ADD COLUMN stream TEXT NOT NULL DEFAULT '';
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

        let store = Self {
            conn: Arc::new(Mutex::new(conn)),
            device_id,
            path: path.to_path_buf(),
        };
        // A killed app leaves status=live rows. Close them so they show in Meetings
        // and so recycled ASR ids from a later session cannot collide.
        if let Err(e) = store.finish_open_meetings(now_ms()) {
            tracing::warn!(error = %e, "Failed to close leftover live meetings on open");
        }
        Ok(store)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn insert_live_meeting(
        &self,
        id: &str,
        started_at: i64,
        title: &str,
    ) -> Result<(), AppError> {
        self.insert_live_meeting_with_context(id, started_at, title, None)
    }

    pub fn insert_live_meeting_with_context(
        &self,
        id: &str,
        started_at: i64,
        title: &str,
        context: Option<&str>,
    ) -> Result<(), AppError> {
        let context = context.and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO meetings (
                id, started_at, finished_at, title, teaser, summary, status,
                context,
                updated_at, deleted_at, revision, last_writer_device_id
            ) VALUES (?1, ?2, NULL, ?3, NULL, NULL, 'live', ?4, ?5, NULL, 1, ?6)",
            params![id, started_at, title, context, now, self.device_id],
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
        speaker: &str,
        stream: &str,
    ) -> Result<(), AppError> {
        if text.is_empty() {
            return Ok(());
        }
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO transcript_segments (
                id, meeting_id, start_ms, end_ms, text, speaker, stream,
                updated_at, deleted_at, revision, last_writer_device_id
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, 1, ?9)
             ON CONFLICT(id) DO UPDATE SET
                meeting_id = excluded.meeting_id,
                start_ms = excluded.start_ms,
                end_ms = excluded.end_ms,
                text = excluded.text,
                speaker = excluded.speaker,
                stream = excluded.stream,
                updated_at = excluded.updated_at,
                deleted_at = NULL,
                revision = revision + 1,
                last_writer_device_id = excluded.last_writer_device_id",
            params![
                id,
                meeting_id,
                start_ms,
                end_ms,
                text,
                speaker,
                stream,
                now,
                self.device_id
            ],
        )
        .map_err(store_err)?;
        Ok(())
    }

    pub fn segment_count(&self, meeting_id: &str) -> Result<i64, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT COUNT(*) FROM transcript_segments
             WHERE meeting_id = ?1 AND deleted_at IS NULL",
            params![meeting_id],
            |row| row.get(0),
        )
        .map_err(store_err)
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

    pub fn update_title(&self, id: &str, title: &str) -> Result<String, AppError> {
        let title = {
            let trimmed = title.trim();
            if trimmed.is_empty() {
                "Untitled meeting".to_string()
            } else {
                trimmed.to_string()
            }
        };
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE meetings
                 SET title = ?1,
                     updated_at = ?2,
                     revision = revision + 1,
                     last_writer_device_id = ?3
                 WHERE id = ?4 AND deleted_at IS NULL",
                params![title, now, self.device_id, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store("Meeting not found".into()));
        }
        Ok(title)
    }

    pub fn update_context(&self, id: &str, context: &str) -> Result<Option<String>, AppError> {
        let context = {
            let trimmed = context.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        };
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE meetings
                 SET context = ?1,
                     updated_at = ?2,
                     revision = revision + 1,
                     last_writer_device_id = ?3
                 WHERE id = ?4 AND deleted_at IS NULL",
                params![context, now, self.device_id, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store("Meeting not found".into()));
        }
        Ok(context)
    }

    pub fn get_live_meeting(&self) -> Result<Option<MeetingDetail>, AppError> {
        let conn = self.conn.lock().unwrap();
        conn.query_row(
            "SELECT id, started_at, finished_at, title, teaser, summary, status, context
             FROM meetings
             WHERE status = 'live' AND deleted_at IS NULL
             ORDER BY started_at DESC
             LIMIT 1",
            [],
            meeting_from_row,
        )
        .optional()
        .map_err(store_err)
    }

    pub fn update_summary(&self, id: &str, summary: &str) -> Result<(), AppError> {
        let teaser = teaser_from_summary(summary);
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE meetings
                 SET summary = ?1,
                     teaser = ?2,
                     updated_at = ?3,
                     revision = revision + 1,
                     last_writer_device_id = ?4
                 WHERE id = ?5 AND deleted_at IS NULL",
                params![summary, teaser, now, self.device_id, id],
            )
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store("Meeting not found".into()));
        }
        Ok(())
    }

    pub fn archive_meeting(&self, id: &str) -> Result<(), AppError> {
        self.set_archived_at(id, now_ms(), false)
    }

    fn set_archived_at(
        &self,
        id: &str,
        archived_at: i64,
        allow_already_archived: bool,
    ) -> Result<(), AppError> {
        let now = now_ms();
        let conn = self.conn.lock().unwrap();
        let sql = if allow_already_archived {
            "UPDATE meetings
             SET archived_at = ?1,
                 updated_at = ?2,
                 revision = revision + 1,
                 last_writer_device_id = ?3
             WHERE id = ?4 AND deleted_at IS NULL"
        } else {
            "UPDATE meetings
             SET archived_at = ?1,
                 updated_at = ?2,
                 revision = revision + 1,
                 last_writer_device_id = ?3
             WHERE id = ?4 AND deleted_at IS NULL AND archived_at IS NULL"
        };
        let changed = conn
            .execute(sql, params![archived_at, now, self.device_id, id])
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store("Meeting not found".into()));
        }
        Ok(())
    }

    pub fn patch_meeting(&self, id: &str, patch: &PatchMeeting) -> Result<MeetingRecord, AppError> {
        if let Some(title) = &patch.title {
            self.update_title(id, title)?;
        }
        if let Some(context) = &patch.context {
            self.update_context(id, context)?;
        }
        if let Some(summary) = &patch.summary {
            self.update_summary(id, summary)?;
        }
        if let Some(archived_at) = patch.archived_at {
            self.set_archived_at(id, archived_at, true)?;
        }
        self.get_record(id)
    }

    pub fn delete_meeting(&self, id: &str) -> Result<(), AppError> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction().map_err(store_err)?;
        tx.execute(
            "DELETE FROM transcript_segments WHERE meeting_id = ?1",
            params![id],
        )
        .map_err(store_err)?;
        let changed = tx
            .execute("DELETE FROM meetings WHERE id = ?1", params![id])
            .map_err(store_err)?;
        if changed == 0 {
            return Err(AppError::Store("Meeting not found".into()));
        }
        tx.commit().map_err(store_err)?;
        Ok(())
    }

    pub fn list_finished(&self) -> Result<Vec<MeetingListItem>, AppError> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(
                "SELECT id, started_at, title, teaser
                 FROM meetings
                 WHERE status = 'finished'
                   AND deleted_at IS NULL
                   AND archived_at IS NULL
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

    pub fn find_record(&self, id: &str) -> Result<Option<MeetingRecord>, AppError> {
        let conn = self.conn.lock().unwrap();
        let meeting = conn
            .query_row(
                "SELECT id, started_at, finished_at, title, teaser, summary, status, context
                 FROM meetings
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                meeting_from_row,
            )
            .optional()
            .map_err(store_err)?;

        let Some(meeting) = meeting else {
            return Ok(None);
        };

        let mut stmt = conn
            .prepare(
                "SELECT id, start_ms, end_ms, text, speaker, stream
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
                    speaker: row.get(4)?,
                    stream: row.get(5)?,
                })
            })
            .map_err(store_err)?;

        let mut segments = Vec::new();
        for row in rows {
            segments.push(row.map_err(store_err)?);
        }

        Ok(Some(MeetingRecord { meeting, segments }))
    }

    pub fn get_record(&self, id: &str) -> Result<MeetingRecord, AppError> {
        self.find_record(id)?
            .ok_or_else(|| AppError::Store("Meeting not found".into()))
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

    if current < 1 {
        conn.execute_batch(MIGRATION_V1).map_err(store_err)?;
        record_migration(conn, 1)?;
    }

    // Add archived_at even if version 2 was stamped without the column.
    if current < 2 || !column_exists(conn, "meetings", "archived_at")? {
        if !column_exists(conn, "meetings", "archived_at")? {
            conn.execute_batch(MIGRATION_V2).map_err(store_err)?;
        }
        record_migration(conn, 2)?;
    }

    if current < 3 || !column_exists(conn, "meetings", "context")? {
        if !column_exists(conn, "meetings", "context")? {
            conn.execute_batch(MIGRATION_V3).map_err(store_err)?;
        }
        record_migration(conn, 3)?;
    }

    if current < SCHEMA_VERSION || !column_exists(conn, "transcript_segments", "speaker")? {
        if !column_exists(conn, "transcript_segments", "speaker")? {
            conn.execute_batch(MIGRATION_V4_SPEAKER)
                .map_err(store_err)?;
        }
        if !column_exists(conn, "transcript_segments", "stream")? {
            conn.execute_batch(MIGRATION_V4_STREAM).map_err(store_err)?;
        }
        record_migration(conn, 4)?;
    }
    Ok(())
}

fn meeting_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MeetingDetail> {
    Ok(MeetingDetail {
        id: row.get(0)?,
        started_at: row.get(1)?,
        finished_at: row.get(2)?,
        title: row.get(3)?,
        teaser: row.get(4)?,
        summary: row.get(5)?,
        status: row.get(6)?,
        context: row.get(7)?,
    })
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, AppError> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(store_err)?;
    let mut rows = stmt.query([]).map_err(store_err)?;
    while let Some(row) = rows.next().map_err(store_err)? {
        let name: String = row.get(1).map_err(store_err)?;
        if name == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn record_migration(conn: &Connection, version: i64) -> Result<(), AppError> {
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
        params![version, now_ms()],
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

fn teaser_from_summary(summary: &str) -> Option<String> {
    let line = summary
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#'))?;
    let stripped = strip_summary_markdown(line);
    if stripped.is_empty() {
        return None;
    }
    Some(truncate_chars(&stripped, 80))
}

fn strip_summary_markdown(line: &str) -> String {
    let mut s = line.trim();
    while let Some(rest) = s.strip_prefix('#') {
        s = rest.trim_start();
    }
    if let Some(rest) = s.strip_prefix("- ") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("* ") {
        s = rest;
    } else if let Some(rest) = s.strip_prefix("• ") {
        s = rest;
    }
    s.replace("**", "")
        .replace("__", "")
        .replace('`', "")
        .trim()
        .to_string()
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    s.chars().take(max_chars).collect()
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
        store
            .insert_segment("s2", "m1", 400, 800, "second", "Remote", "system")
            .unwrap();
        store
            .insert_segment("s1", "m1", 0, 300, "first", "User", "mic")
            .unwrap();
        store
            .insert_segment("s0", "m1", 10, 20, "", "User", "mic")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        let record = store.get_record("m1").unwrap();
        let texts: Vec<_> = record.segments.iter().map(|s| s.text.as_str()).collect();
        assert_eq!(texts, vec!["first", "second"]);
        assert_eq!(record.segments[0].speaker, "User");
        assert_eq!(record.segments[0].stream, "mic");
        assert_eq!(record.segments[1].speaker, "Remote");
        assert_eq!(record.segments[1].stream, "system");
    }

    #[test]
    fn two_meetings_can_reuse_asr_segment_ids() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "First").unwrap();
        store.insert_live_meeting("m2", 2_000, "Second").unwrap();
        store
            .insert_segment("m1:seg-0", "m1", 0, 100, "hello", "User", "mic")
            .unwrap();
        store
            .insert_segment("m2:seg-0", "m2", 0, 100, "world", "Remote", "system")
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
    fn opening_store_finishes_leftover_live_meetings() {
        let dir = std::env::temp_dir().join(format!("meetings-reopen-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let store = MeetingStore::open(&path).unwrap();
            store.insert_live_meeting("m1", 1_000, "Stuck").unwrap();
            store
                .insert_segment("m1:seg-0", "m1", 0, 100, "hello", "User", "mic")
                .unwrap();
        }
        let store = MeetingStore::open(&path).unwrap();
        let row = store.get_record("m1").unwrap();
        assert_eq!(row.meeting.status, "finished");
        assert!(row.meeting.finished_at.is_some());
        assert_eq!(row.segments.len(), 1);
        assert_eq!(row.segments[0].text, "hello");
        assert_eq!(store.list_finished().unwrap().len(), 1);
    }

    #[test]
    fn insert_segment_upserts_on_id_conflict() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "Call").unwrap();
        store
            .insert_segment("m1:seg-0", "m1", 0, 100, "hello", "User", "mic")
            .unwrap();
        store
            .insert_segment("m1:seg-0", "m1", 0, 150, "hello world", "Remote", "system")
            .unwrap();
        let row = store.get_record("m1").unwrap();
        assert_eq!(row.segments.len(), 1);
        assert_eq!(row.segments[0].text, "hello world");
        assert_eq!(row.segments[0].speaker, "Remote");
        assert_eq!(row.segments[0].stream, "system");
        assert_eq!(store.segment_count("m1").unwrap(), 1);
    }

    #[test]
    fn default_path_uses_app_support() {
        let path = default_db_path();
        let s = path.to_string_lossy();
        assert!(s.contains(APP_SUPPORT_DIR));
        assert!(s.ends_with(DB_FILE));
    }

    #[test]
    fn update_title_renames_and_blank_becomes_untitled() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        let saved = store.update_title("m1", "  Weekly sync  ").unwrap();
        assert_eq!(saved, "Weekly sync");
        assert_eq!(store.get_record("m1").unwrap().meeting.title, "Weekly sync");
        assert_eq!(store.list_finished().unwrap()[0].title, "Weekly sync");

        let blank = store.update_title("m1", "   ").unwrap();
        assert_eq!(blank, "Untitled meeting");
        assert!(store.update_title("missing", "Nope").is_err());
    }

    #[test]
    fn update_summary_writes_summary_and_teaser() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        store
            .update_summary(
                "m1",
                "- **Ship** the API by Friday\n- Next steps for billing",
            )
            .unwrap();
        let row = store.get_record("m1").unwrap();
        assert_eq!(
            row.meeting.summary.as_deref(),
            Some("- **Ship** the API by Friday\n- Next steps for billing")
        );
        assert_eq!(
            row.meeting.teaser.as_deref(),
            Some("Ship the API by Friday")
        );
        assert_eq!(
            store.list_finished().unwrap()[0].teaser.as_deref(),
            Some("Ship the API by Friday")
        );

        let long_line = format!("- {}", "a".repeat(120));
        store.update_summary("m1", &long_line).unwrap();
        let teaser = store.get_record("m1").unwrap().meeting.teaser.unwrap();
        assert_eq!(teaser.chars().count(), 80);

        assert!(store.update_summary("missing", "Nope").is_err());
    }

    #[test]
    fn teaser_skips_section_headings() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();
        store
            .update_summary(
                "m1",
                "## Executive Summary\n\n- **Pavel Svitek** will start the mock\n",
            )
            .unwrap();
        assert_eq!(
            store.get_record("m1").unwrap().meeting.teaser.as_deref(),
            Some("Pavel Svitek will start the mock")
        );
    }

    #[test]
    fn archive_hides_from_list_but_keeps_the_row() {
        let store = temp_db();
        store.insert_live_meeting("keep", 1_000, "Keep").unwrap();
        store.insert_live_meeting("hide", 2_000, "Hide").unwrap();
        store.finish_meeting("keep", 1_500).unwrap();
        store.finish_meeting("hide", 2_500).unwrap();

        store.archive_meeting("hide").unwrap();

        let list = store.list_finished().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "keep");
        assert_eq!(store.get_record("hide").unwrap().meeting.title, "Hide");
        assert!(store.archive_meeting("hide").is_err());
        assert!(store.archive_meeting("missing").is_err());
    }

    #[test]
    fn delete_meeting_removes_row_and_segments() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "Keep").unwrap();
        store.insert_live_meeting("m2", 2_000, "Delete me").unwrap();
        store.finish_meeting("m1", 1_500).unwrap();
        store.finish_meeting("m2", 2_500).unwrap();
        store
            .insert_segment("m2:seg-0", "m2", 0, 100, "hello", "User", "mic")
            .unwrap();

        store.delete_meeting("m2").unwrap();

        assert_eq!(store.list_finished().unwrap().len(), 1);
        assert_eq!(store.list_finished().unwrap()[0].id, "m1");
        assert!(store.get_record("m2").is_err());
        assert_eq!(store.segment_count("m2").unwrap(), 0);
        assert!(store.delete_meeting("m2").is_err());
    }

    #[test]
    fn migrates_v1_database_and_adds_archived_at() {
        let dir = std::env::temp_dir().join(format!("meetings-v1-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATION_V1).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO meetings (
                    id, started_at, finished_at, title, teaser, summary, status,
                    updated_at, deleted_at, revision, last_writer_device_id
                ) VALUES ('m1', 1000, 2000, 'Old', NULL, NULL, 'finished', 2000, NULL, 1, 'dev')",
                [],
            )
            .unwrap();
        }

        let store = MeetingStore::open(&path).unwrap();
        store.archive_meeting("m1").unwrap();
        assert!(store.list_finished().unwrap().is_empty());
        assert_eq!(store.get_record("m1").unwrap().meeting.title, "Old");
    }

    #[test]
    fn repairs_version_2_stamp_missing_archived_at() {
        let dir = std::env::temp_dir().join(format!("meetings-v2-gap-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATION_V1).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1), (2, 2)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO meetings (
                    id, started_at, finished_at, title, teaser, summary, status,
                    updated_at, deleted_at, revision, last_writer_device_id
                ) VALUES ('m1', 1000, 2000, 'Old', NULL, NULL, 'finished', 2000, NULL, 1, 'dev')",
                [],
            )
            .unwrap();
        }

        let store = MeetingStore::open(&path).unwrap();
        let list = store.list_finished().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "m1");
        store.archive_meeting("m1").unwrap();
        assert!(store.list_finished().unwrap().is_empty());
    }

    #[test]
    fn update_context_saves_trimmed_text_and_clears_blank() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();

        let saved = store
            .update_context("m1", "  Participants: Pavel, Igor\nProject: Halifax  ")
            .unwrap();
        assert_eq!(
            saved.as_deref(),
            Some("Participants: Pavel, Igor\nProject: Halifax")
        );
        assert_eq!(
            store.get_record("m1").unwrap().meeting.context.as_deref(),
            Some("Participants: Pavel, Igor\nProject: Halifax")
        );

        let live = store.get_live_meeting().unwrap().unwrap();
        assert_eq!(live.id, "m1");
        assert_eq!(
            live.context.as_deref(),
            Some("Participants: Pavel, Igor\nProject: Halifax")
        );

        store.finish_meeting("m1", 2_000).unwrap();
        assert!(store.get_live_meeting().unwrap().is_none());

        let cleared = store.update_context("m1", "   \n  ").unwrap();
        assert!(cleared.is_none());
        assert!(store.get_record("m1").unwrap().meeting.context.is_none());
        assert!(store.update_context("missing", "Nope").is_err());
    }

    #[test]
    fn find_record_returns_none_when_missing() {
        let store = temp_db();
        assert!(store.find_record("missing").unwrap().is_none());
    }

    #[test]
    fn patch_meeting_updates_only_provided_keys() {
        let store = temp_db();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store
            .insert_segment("m1:seg-0", "m1", 0, 100, "hello", "User", "mic")
            .unwrap();

        let titled = store
            .patch_meeting(
                "m1",
                &PatchMeeting {
                    title: Some("  Weekly sync  ".into()),
                    ..PatchMeeting::default()
                },
            )
            .unwrap();
        assert_eq!(titled.meeting.title, "Weekly sync");
        assert!(titled.meeting.context.is_none());
        assert_eq!(titled.segments.len(), 1);

        let both = store
            .patch_meeting(
                "m1",
                &PatchMeeting {
                    title: Some("Standup".into()),
                    context: Some("  Pavel, Igor  ".into()),
                    ..PatchMeeting::default()
                },
            )
            .unwrap();
        assert_eq!(both.meeting.title, "Standup");
        assert_eq!(both.meeting.context.as_deref(), Some("Pavel, Igor"));
        assert!(both.meeting.summary.is_none());

        let with_summary = store
            .patch_meeting(
                "m1",
                &PatchMeeting {
                    summary: Some("# Last call\n- Ship the API".into()),
                    ..PatchMeeting::default()
                },
            )
            .unwrap();
        assert_eq!(with_summary.meeting.title, "Standup");
        assert_eq!(with_summary.meeting.context.as_deref(), Some("Pavel, Igor"));
        assert_eq!(
            with_summary.meeting.summary.as_deref(),
            Some("# Last call\n- Ship the API")
        );

        let context_only = store
            .patch_meeting(
                "m1",
                &PatchMeeting {
                    context: Some("".into()),
                    ..PatchMeeting::default()
                },
            )
            .unwrap();
        assert_eq!(context_only.meeting.title, "Standup");
        assert!(context_only.meeting.context.is_none());

        store.finish_meeting("m1", 2_000).unwrap();
        store
            .patch_meeting(
                "m1",
                &PatchMeeting {
                    archived_at: Some(3_000),
                    ..PatchMeeting::default()
                },
            )
            .unwrap();
        assert!(store.list_finished().unwrap().is_empty());
        assert_eq!(store.get_record("m1").unwrap().meeting.title, "Standup");
        assert!(store
            .patch_meeting("missing", &PatchMeeting::default())
            .is_err());
    }

    #[test]
    fn new_meeting_has_null_context() {
        let store = temp_db();
        store.insert_live_meeting("m1", 1_000, "Call").unwrap();
        assert!(store.get_record("m1").unwrap().meeting.context.is_none());
    }

    #[test]
    fn insert_live_meeting_can_include_context() {
        let store = temp_db();
        store
            .insert_live_meeting_with_context(
                "m1",
                1_000,
                "Call",
                Some("  Pavel\n\n## Previous meeting summary\nShip it  "),
            )
            .unwrap();
        assert_eq!(
            store.get_record("m1").unwrap().meeting.context.as_deref(),
            Some("Pavel\n\n## Previous meeting summary\nShip it")
        );
    }

    #[test]
    fn migrates_v2_database_and_adds_context() {
        let dir = std::env::temp_dir().join(format!("meetings-v2-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATION_V1).unwrap();
            conn.execute_batch(MIGRATION_V2).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1), (2, 2)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO meetings (
                    id, started_at, finished_at, title, teaser, summary, status,
                    updated_at, deleted_at, revision, last_writer_device_id, archived_at
                ) VALUES ('m1', 1000, 2000, 'Old', NULL, NULL, 'finished', 2000, NULL, 1, 'dev', NULL)",
                [],
            )
            .unwrap();
        }

        let store = MeetingStore::open(&path).unwrap();
        assert!(store.get_record("m1").unwrap().meeting.context.is_none());
        store.update_context("m1", "Participants: Pavel").unwrap();
        assert_eq!(
            store.get_record("m1").unwrap().meeting.context.as_deref(),
            Some("Participants: Pavel")
        );
    }

    #[test]
    fn migrates_v3_database_and_keeps_segments_without_speaker() {
        let dir = std::env::temp_dir().join(format!("meetings-v3-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let conn = Connection::open(&path).unwrap();
            conn.execute_batch(MIGRATION_V1).unwrap();
            conn.execute_batch(MIGRATION_V2).unwrap();
            conn.execute_batch(MIGRATION_V3).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1), (2, 2), (3, 3)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO meetings (
                    id, started_at, finished_at, title, teaser, summary, status,
                    updated_at, deleted_at, revision, last_writer_device_id, archived_at, context
                ) VALUES ('m1', 1000, 2000, 'Old', NULL, NULL, 'finished', 2000, NULL, 1, 'dev', NULL, NULL)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO transcript_segments (
                    id, meeting_id, start_ms, end_ms, text,
                    updated_at, deleted_at, revision, last_writer_device_id
                ) VALUES ('m1:seg-0', 'm1', 0, 100, 'hello', 2000, NULL, 1, 'dev')",
                [],
            )
            .unwrap();
        }

        let store = MeetingStore::open(&path).unwrap();
        let segment = &store.get_record("m1").unwrap().segments[0];
        assert_eq!(segment.text, "hello");
        assert_eq!(segment.speaker, "");
        assert_eq!(segment.stream, "");

        store
            .insert_segment("m1:seg-1", "m1", 100, 200, "there", "Remote", "system")
            .unwrap();
        let saved = &store.get_record("m1").unwrap().segments[1];
        assert_eq!(saved.speaker, "Remote");
        assert_eq!(saved.stream, "system");
    }
}
