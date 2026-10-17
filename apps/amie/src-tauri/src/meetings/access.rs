//! Restricted access to the meeting store for agents (the MCP server).
//!
//! This module is the trust boundary. [`AgentAccess`] is the only handle the
//! MCP layer receives, and it can only do what is listed here:
//!
//! * read meetings, transcripts and search results;
//! * edit a meeting's title, context and summary;
//! * archive and unarchive a meeting.
//!
//! It cannot write transcript segments, hard-delete a meeting, or touch a
//! meeting that is still being recorded. Those operations are absent from this
//! API rather than guarded by a flag, so a new tool cannot reach them by
//! accident.
//!
//! Connections follow the same rule. Reads use a read-only SQLite connection.
//! Writes use a second connection that is never used for reading. Neither
//! creates the database nor runs migrations: the Amie app owns the schema, and
//! a mismatch is reported instead of repaired.

use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::{params, Connection, ErrorCode, OpenFlags, OptionalExtension, TransactionBehavior};

use super::{
    meeting_from_row, now_ms, teaser_from_summary, MeetingStore, DEVICE_ID_KEY, SCHEMA_VERSION,
};
use crate::error::AppError;
use crate::ipc::meetings::{MeetingDetail, MeetingRecord, MeetingSegment};

pub const MAX_TITLE_CHARS: usize = 200;
pub const MAX_NOTE_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AccessError {
    NotFound,
    /// The meeting is still being recorded; the app owns it until it finishes.
    Live,
    /// The request itself is wrong (blank title, oversized text, no fields).
    Invalid(String),
    Locked,
    /// The database cannot be used as is (missing, wrong schema version).
    Unavailable(String),
    Store(String),
}

impl std::fmt::Display for AccessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotFound => f.write_str("meeting not found"),
            Self::Live => {
                f.write_str("meeting is being recorded and cannot be changed until it finishes")
            }
            Self::Invalid(message) | Self::Unavailable(message) | Self::Store(message) => {
                f.write_str(message)
            }
            Self::Locked => f.write_str("database locked"),
        }
    }
}

impl std::error::Error for AccessError {}

impl From<rusqlite::Error> for AccessError {
    fn from(err: rusqlite::Error) -> Self {
        match &err {
            rusqlite::Error::SqliteFailure(failure, _)
                if matches!(
                    failure.code,
                    ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked
                ) =>
            {
                Self::Locked
            }
            _ => Self::Store(err.to_string()),
        }
    }
}

impl From<AppError> for AccessError {
    fn from(err: AppError) -> Self {
        let text = err.to_string();
        if text.to_lowercase().contains("locked") {
            Self::Locked
        } else {
            Self::Store(text)
        }
    }
}

/// A meeting with its transcript, as the read tools need it.
#[derive(Debug, Clone)]
pub struct MeetingView {
    pub record: MeetingRecord,
    pub archived_at: Option<i64>,
}

/// A meeting's fields without the transcript. Returned by every write.
#[derive(Debug, Clone)]
pub struct MeetingHeader {
    pub meeting: MeetingDetail,
    pub archived_at: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct MeetingEdit {
    pub title: Option<String>,
    /// An empty string clears the context.
    pub context: Option<String>,
    pub summary: Option<String>,
}

#[derive(Debug, Clone)]
pub struct AccessInfo {
    pub device_id: String,
    pub db_path: String,
    pub schema_version: i64,
}

#[derive(Debug, Clone)]
pub struct MeetingListFilter {
    pub status: Option<String>,
    pub start_ms: Option<i64>,
    pub end_ms: Option<i64>,
    pub include_archived: bool,
    pub cursor: Option<(i64, String)>,
    pub limit: u32,
}

#[derive(Debug, Clone)]
pub struct MeetingRow {
    pub id: String,
    pub started_at: i64,
    pub finished_at: Option<i64>,
    pub title: String,
    pub teaser: Option<String>,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct MeetingListPage {
    pub meetings: Vec<MeetingRow>,
    pub next_cursor: Option<(i64, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchScope {
    All,
    Title,
    Summary,
    Transcript,
}

impl SearchScope {
    fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Title => "title",
            Self::Summary => "summary",
            Self::Transcript => "transcript",
        }
    }
}

#[derive(Debug, Clone)]
pub struct MeetingSearch {
    pub query: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub limit: u32,
    pub scope: SearchScope,
}

#[derive(Debug, Clone)]
pub struct MeetingSearchHit {
    pub meeting_id: String,
    pub title: String,
    pub started_at: i64,
    pub summary: Option<String>,
    pub transcript_hit: Option<String>,
}

#[derive(Debug, Clone)]
pub struct SegmentPageQuery {
    pub meeting_id: String,
    pub cursor: Option<(i64, String)>,
    pub limit: u32,
}

#[derive(Debug, Clone)]
pub struct SegmentPage {
    pub segments: Vec<MeetingSegment>,
    pub next_cursor: Option<(i64, String)>,
}

#[derive(Clone)]
pub struct AgentAccess {
    /// Opened `SQLITE_OPEN_READ_ONLY`. Used only for reads.
    reader: MeetingStore,
    /// Used only by `edit`, `archive` and `unarchive`.
    writer: Arc<Mutex<Connection>>,
}

impl AgentAccess {
    pub fn open(path: &Path) -> Result<Self, AccessError> {
        if !path.is_file() {
            return Err(AccessError::Unavailable(format!(
                "Amie database not found at {}. Launch Amie once to create it, or set AMIE_DB_PATH.",
                path.display()
            )));
        }
        let read_conn = open_connection(path, false)?;
        check_schema(&read_conn)?;
        let device_id = read_device_id(&read_conn)?;
        let reader = MeetingStore {
            conn: Arc::new(Mutex::new(read_conn)),
            device_id,
            path: path.to_path_buf(),
        };
        let writer = Arc::new(Mutex::new(open_connection(path, true)?));
        Ok(Self { reader, writer })
    }

    pub fn info(&self) -> AccessInfo {
        AccessInfo {
            device_id: self.reader.device_id.clone(),
            db_path: self.reader.path.display().to_string(),
            schema_version: SCHEMA_VERSION,
        }
    }

    // --- reads ---

    pub fn list(&self, filter: &MeetingListFilter) -> Result<MeetingListPage, AccessError> {
        self.reader.list_page(filter)
    }

    pub fn get(&self, id: &str) -> Result<MeetingView, AccessError> {
        let record = self.reader.find_record(id)?.ok_or(AccessError::NotFound)?;
        let archived_at = {
            let conn = self.reader.conn.lock().unwrap();
            archived_at_of(&conn, id)?
        };
        Ok(MeetingView {
            record,
            archived_at: archived_at.ok_or(AccessError::NotFound)?,
        })
    }

    pub fn live(&self) -> Result<Option<MeetingView>, AccessError> {
        match self.reader.get_live_meeting()? {
            Some(detail) => self.get(&detail.id).map(Some),
            None => Ok(None),
        }
    }

    pub fn page_transcript(&self, query: &SegmentPageQuery) -> Result<SegmentPage, AccessError> {
        self.reader.page_segments(query)
    }

    pub fn search(&self, query: &MeetingSearch) -> Result<Vec<MeetingSearchHit>, AccessError> {
        self.reader.search_page(query)
    }

    // --- writes ---

    pub fn edit(&self, id: &str, edit: &MeetingEdit) -> Result<MeetingHeader, AccessError> {
        let title = match &edit.title {
            Some(raw) => {
                let title = raw.trim();
                if title.is_empty() {
                    return Err(AccessError::Invalid("title must be non-empty".into()));
                }
                if title.chars().count() > MAX_TITLE_CHARS {
                    return Err(AccessError::Invalid(format!(
                        "title exceeds {MAX_TITLE_CHARS} characters"
                    )));
                }
                Some(title.to_string())
            }
            None => None,
        };
        let context = match &edit.context {
            Some(raw) => {
                check_note_size("context", raw)?;
                let trimmed = raw.trim();
                Some((!trimmed.is_empty()).then(|| trimmed.to_string()))
            }
            None => None,
        };
        let summary = match &edit.summary {
            Some(raw) => {
                check_note_size("summary", raw)?;
                if raw.trim().is_empty() {
                    return Err(AccessError::Invalid("summary must be non-empty".into()));
                }
                Some(raw.clone())
            }
            None => None,
        };
        if title.is_none() && context.is_none() && summary.is_none() {
            return Err(AccessError::Invalid(
                "nothing to update: provide title, context or summary".into(),
            ));
        }

        let teaser = summary.as_deref().and_then(teaser_from_summary);
        self.write(id, |tx, device_id| {
            tx.execute(
                "UPDATE meetings
                 SET title = CASE WHEN ?1 THEN ?2 ELSE title END,
                     context = CASE WHEN ?3 THEN ?4 ELSE context END,
                     summary = CASE WHEN ?5 THEN ?6 ELSE summary END,
                     teaser = CASE WHEN ?5 THEN ?7 ELSE teaser END,
                     updated_at = ?8,
                     revision = revision + 1,
                     last_writer_device_id = ?9
                 WHERE id = ?10 AND deleted_at IS NULL",
                params![
                    title.is_some(),
                    title,
                    context.is_some(),
                    context.clone().flatten(),
                    summary.is_some(),
                    summary,
                    teaser,
                    now_ms(),
                    device_id,
                    id
                ],
            )?;
            Ok(())
        })
    }

    /// Idempotent: archiving an archived meeting keeps its original timestamp.
    pub fn archive(&self, id: &str) -> Result<MeetingHeader, AccessError> {
        self.write_if(
            id,
            |header| header.archived_at.is_none(),
            |tx, device_id| {
                tx.execute(
                    "UPDATE meetings
                 SET archived_at = ?1,
                     updated_at = ?1,
                     revision = revision + 1,
                     last_writer_device_id = ?2
                 WHERE id = ?3 AND deleted_at IS NULL",
                    params![now_ms(), device_id, id],
                )?;
                Ok(())
            },
        )
    }

    /// Idempotent: unarchiving a meeting that is not archived changes nothing.
    pub fn unarchive(&self, id: &str) -> Result<MeetingHeader, AccessError> {
        self.write_if(
            id,
            |header| header.archived_at.is_some(),
            |tx, device_id| {
                tx.execute(
                    "UPDATE meetings
                 SET archived_at = NULL,
                     updated_at = ?1,
                     revision = revision + 1,
                     last_writer_device_id = ?2
                 WHERE id = ?3 AND deleted_at IS NULL",
                    params![now_ms(), device_id, id],
                )?;
                Ok(())
            },
        )
    }

    fn write(
        &self,
        id: &str,
        apply: impl FnOnce(&rusqlite::Transaction<'_>, &str) -> Result<(), AccessError>,
    ) -> Result<MeetingHeader, AccessError> {
        self.write_if(id, |_| true, apply)
    }

    /// Runs `apply` inside one immediate transaction, after checking that the
    /// meeting exists and is not live. A meeting never goes back to live, so
    /// the check cannot go stale while the transaction holds the write lock.
    fn write_if(
        &self,
        id: &str,
        needs_change: impl FnOnce(&MeetingHeader) -> bool,
        apply: impl FnOnce(&rusqlite::Transaction<'_>, &str) -> Result<(), AccessError>,
    ) -> Result<MeetingHeader, AccessError> {
        let mut conn = self.writer.lock().unwrap();
        let tx = conn.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let header = header_of(&tx, id)?.ok_or(AccessError::NotFound)?;
        if header.meeting.status == "live" {
            return Err(AccessError::Live);
        }
        if !needs_change(&header) {
            return Ok(header);
        }
        apply(&tx, &self.reader.device_id)?;
        let updated = header_of(&tx, id)?.ok_or(AccessError::NotFound)?;
        tx.commit()?;
        Ok(updated)
    }
}

fn check_note_size(field: &str, text: &str) -> Result<(), AccessError> {
    if text.len() > MAX_NOTE_BYTES {
        return Err(AccessError::Invalid(format!(
            "{field} exceeds {} KB",
            MAX_NOTE_BYTES / 1024
        )));
    }
    Ok(())
}

fn open_connection(path: &Path, write: bool) -> Result<Connection, AccessError> {
    let flags = if write {
        OpenFlags::SQLITE_OPEN_READ_WRITE
    } else {
        OpenFlags::SQLITE_OPEN_READ_ONLY
    } | OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let conn = Connection::open_with_flags(path, flags)?;
    conn.busy_timeout(Duration::from_millis(5_000))?;
    if write {
        conn.pragma_update(None, "foreign_keys", "ON")?;
    }
    Ok(conn)
}

fn check_schema(conn: &Connection) -> Result<(), AccessError> {
    let version: Option<i64> = conn
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .map_err(|err| match err {
            rusqlite::Error::SqliteFailure(..) if err.to_string().contains("no such table") => {
                AccessError::Unavailable("not an Amie meetings database".into())
            }
            other => AccessError::from(other),
        })?;
    match version.unwrap_or(0) {
        found if found == SCHEMA_VERSION => Ok(()),
        found if found < SCHEMA_VERSION => Err(AccessError::Unavailable(format!(
            "Amie database is at schema v{found}, this server needs v{SCHEMA_VERSION}. Open Amie once to upgrade it."
        ))),
        found => Err(AccessError::Unavailable(format!(
            "Amie database is at schema v{found}, newer than this server (v{SCHEMA_VERSION}). Update amie_mcp."
        ))),
    }
}

fn read_device_id(conn: &Connection) -> Result<String, AccessError> {
    conn.query_row(
        "SELECT value FROM sync_state WHERE key = ?1",
        params![DEVICE_ID_KEY],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| {
        AccessError::Unavailable("Amie database has no device id. Open Amie once.".into())
    })
}

/// `None` when the meeting does not exist, `Some(None)` when not archived.
fn archived_at_of(conn: &Connection, id: &str) -> Result<Option<Option<i64>>, AccessError> {
    Ok(conn
        .query_row(
            "SELECT archived_at FROM meetings WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| row.get(0),
        )
        .optional()?)
}

fn header_of(conn: &Connection, id: &str) -> Result<Option<MeetingHeader>, AccessError> {
    Ok(conn
        .query_row(
            "SELECT id, started_at, finished_at, title, teaser, summary, status, context,
                    archived_at
             FROM meetings
             WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |row| {
                Ok(MeetingHeader {
                    meeting: meeting_from_row(row)?,
                    archived_at: row.get(8)?,
                })
            },
        )
        .optional()?)
}

// Query code lives here, not on `MeetingStore`'s public surface, so only
// `AgentAccess` can call it.
impl MeetingStore {
    fn list_page(&self, filter: &MeetingListFilter) -> Result<MeetingListPage, AccessError> {
        let include_archived = i64::from(filter.include_archived);
        let cursor_started = filter.cursor.as_ref().map(|(started, _)| *started);
        let cursor_id = filter.cursor.as_ref().map(|(_, id)| id.clone());
        let fetch = i64::from(filter.limit.saturating_add(1));

        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, started_at, finished_at, title, teaser, status
             FROM meetings
             WHERE deleted_at IS NULL
               AND (?1 IS NULL OR status = ?1)
               AND (?2 = 1 OR archived_at IS NULL)
               AND (?3 IS NULL OR started_at >= ?3)
               AND (?4 IS NULL OR started_at <= ?4)
               AND (
                 ?5 IS NULL
                 OR started_at < ?5
                 OR (started_at = ?5 AND id < ?6)
               )
             ORDER BY started_at DESC, id DESC
             LIMIT ?7",
        )?;
        let rows = stmt.query_map(
            params![
                filter.status,
                include_archived,
                filter.start_ms,
                filter.end_ms,
                cursor_started,
                cursor_id,
                fetch
            ],
            |row| {
                Ok(MeetingRow {
                    id: row.get(0)?,
                    started_at: row.get(1)?,
                    finished_at: row.get(2)?,
                    title: row.get(3)?,
                    teaser: row.get(4)?,
                    status: row.get(5)?,
                })
            },
        )?;
        let mut meetings = rows.collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if meetings.len() > filter.limit as usize {
            meetings.pop();
            meetings.last().map(|row| (row.started_at, row.id.clone()))
        } else {
            None
        };
        Ok(MeetingListPage {
            meetings,
            next_cursor,
        })
    }

    fn search_page(&self, query: &MeetingSearch) -> Result<Vec<MeetingSearchHit>, AccessError> {
        let pattern = like_contains_pattern(&query.query);
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT m.id, m.title, m.started_at, m.summary,
                    (
                      SELECT s.text
                      FROM transcript_segments s
                      WHERE s.meeting_id = m.id
                        AND s.deleted_at IS NULL
                        AND s.text LIKE ?1 ESCAPE '\\'
                      ORDER BY s.start_ms ASC, s.id ASC
                      LIMIT 1
                    )
             FROM meetings m
             WHERE m.deleted_at IS NULL
               AND m.archived_at IS NULL
               AND m.started_at >= ?2
               AND (?3 IS NULL OR m.started_at <= ?3)
               AND (
                 (?4 IN ('all', 'title') AND m.title LIKE ?1 ESCAPE '\\')
                 OR (?4 IN ('all', 'summary') AND IFNULL(m.summary, '') LIKE ?1 ESCAPE '\\')
                 OR (
                   ?4 IN ('all', 'transcript')
                   AND EXISTS (
                     SELECT 1 FROM transcript_segments s
                     WHERE s.meeting_id = m.id
                       AND s.deleted_at IS NULL
                       AND s.text LIKE ?1 ESCAPE '\\'
                   )
                 )
               )
             ORDER BY m.started_at DESC, m.id DESC
             LIMIT ?5",
        )?;
        let rows = stmt.query_map(
            params![
                pattern,
                query.start_ms,
                query.end_ms,
                query.scope.as_str(),
                query.limit
            ],
            |row| {
                Ok(MeetingSearchHit {
                    meeting_id: row.get(0)?,
                    title: row.get(1)?,
                    started_at: row.get(2)?,
                    summary: row.get(3)?,
                    transcript_hit: row.get(4)?,
                })
            },
        )?;
        Ok(rows.collect::<Result<Vec<_>, _>>()?)
    }

    fn page_segments(&self, page: &SegmentPageQuery) -> Result<SegmentPage, AccessError> {
        let cursor_start = page.cursor.as_ref().map(|(start, _)| *start);
        let cursor_id = page.cursor.as_ref().map(|(_, id)| id.clone());
        let fetch = i64::from(page.limit.saturating_add(1));

        let conn = self.conn.lock().unwrap();
        archived_at_of(&conn, &page.meeting_id)?.ok_or(AccessError::NotFound)?;
        let mut stmt = conn.prepare(
            "SELECT id, start_ms, end_ms, text, speaker, stream
             FROM transcript_segments
             WHERE meeting_id = ?1
               AND deleted_at IS NULL
               AND (
                 ?2 IS NULL
                 OR start_ms > ?2
                 OR (start_ms = ?2 AND id > ?3)
               )
             ORDER BY start_ms ASC, id ASC
             LIMIT ?4",
        )?;
        let rows = stmt.query_map(
            params![page.meeting_id, cursor_start, cursor_id, fetch],
            |row| {
                Ok(MeetingSegment {
                    id: row.get(0)?,
                    start_ms: row.get(1)?,
                    end_ms: row.get(2)?,
                    text: row.get(3)?,
                    speaker: row.get(4)?,
                    stream: row.get(5)?,
                })
            },
        )?;
        let mut segments = rows.collect::<Result<Vec<_>, _>>()?;
        let next_cursor = if segments.len() > page.limit as usize {
            segments.pop();
            segments.last().map(|seg| (seg.start_ms, seg.id.clone()))
        } else {
            None
        };
        Ok(SegmentPage {
            segments,
            next_cursor,
        })
    }
}

fn like_contains_pattern(query: &str) -> String {
    let mut out = String::from('%');
    for ch in query.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out.push('%');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    struct Fixture {
        app: MeetingStore,
        access: AgentAccess,
        path: std::path::PathBuf,
    }

    fn fixture() -> Fixture {
        let dir = std::env::temp_dir().join(format!("amie-access-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        let app = MeetingStore::open(&path).unwrap();
        let access = AgentAccess::open(&path).unwrap();
        Fixture { app, access, path }
    }

    fn finished(app: &MeetingStore, id: &str, started: i64) {
        app.insert_live_meeting(id, started, id).unwrap();
        app.finish_meeting(id, started + 60_000).unwrap();
    }

    fn segments_of(app: &MeetingStore, id: &str) -> Vec<(String, String)> {
        app.get_record(id)
            .unwrap()
            .segments
            .into_iter()
            .map(|seg| (seg.id, seg.text))
            .collect()
    }

    #[test]
    fn open_requires_an_existing_current_database() {
        let dir = std::env::temp_dir().join(format!("amie-access-{}", Uuid::new_v4()));
        let missing = dir.join("meetings.db");
        let err = AgentAccess::open(&missing).err().unwrap();
        assert!(matches!(err, AccessError::Unavailable(_)), "{err}");
        assert!(!dir.exists(), "must not create the database directory");

        std::fs::create_dir_all(&dir).unwrap();
        let old = dir.join("old.db");
        {
            let conn = Connection::open(&old).unwrap();
            conn.execute_batch(super::super::MIGRATION_V1).unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (1, 1)",
                [],
            )
            .unwrap();
        }
        let err = AgentAccess::open(&old).err().unwrap();
        assert!(
            err.to_string().contains("Open Amie once to upgrade"),
            "{err}"
        );
        let conn = Connection::open(&old).unwrap();
        assert!(
            !super::super::column_exists(&conn, "meetings", "archived_at").unwrap(),
            "must not migrate"
        );

        let newer = dir.join("newer.db");
        {
            let app = MeetingStore::open(&newer).unwrap();
            let conn = app.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, 1)",
                params![SCHEMA_VERSION + 1],
            )
            .unwrap();
        }
        let err = AgentAccess::open(&newer).err().unwrap();
        assert!(err.to_string().contains("Update amie_mcp"), "{err}");

        let not_amie = dir.join("other.db");
        Connection::open(&not_amie)
            .unwrap()
            .execute_batch("CREATE TABLE t (x)")
            .unwrap();
        let err = AgentAccess::open(&not_amie).err().unwrap();
        assert!(err.to_string().contains("not an Amie"), "{err}");
    }

    #[test]
    fn reader_connection_cannot_write() {
        let f = fixture();
        finished(&f.app, "m", 1_000);
        let conn = f.access.reader.conn.lock().unwrap();
        let err = conn
            .execute("UPDATE meetings SET title = 'x' WHERE id = 'm'", [])
            .unwrap_err();
        assert!(err.to_string().contains("readonly"), "{err}");
    }

    #[test]
    fn open_does_not_finish_live_meetings() {
        let f = fixture();
        f.app.insert_live_meeting("live", 1_000, "Live").unwrap();
        let access = AgentAccess::open(&f.path).unwrap();
        let live = access.live().unwrap().unwrap();
        assert_eq!(live.record.meeting.id, "live");
        assert_eq!(live.record.meeting.status, "live");
    }

    #[test]
    fn edit_changes_title_context_and_summary_in_one_write() {
        let f = fixture();
        finished(&f.app, "m", 1_000);
        let header = f
            .access
            .edit(
                "m",
                &MeetingEdit {
                    title: Some("  Pricing review ".into()),
                    context: Some("Pavel, Igor".into()),
                    summary: Some("## Notes\n- **Decided** pricing".into()),
                },
            )
            .unwrap();
        assert_eq!(header.meeting.title, "Pricing review");
        assert_eq!(header.meeting.context.as_deref(), Some("Pavel, Igor"));
        assert_eq!(header.meeting.teaser.as_deref(), Some("Decided pricing"));

        let only_context = f
            .access
            .edit(
                "m",
                &MeetingEdit {
                    context: Some("   ".into()),
                    ..MeetingEdit::default()
                },
            )
            .unwrap();
        assert_eq!(only_context.meeting.context, None);
        assert_eq!(only_context.meeting.title, "Pricing review");
        assert!(only_context.meeting.summary.is_some());
    }

    #[test]
    fn edit_rejects_bad_input_without_writing() {
        let f = fixture();
        finished(&f.app, "m", 1_000);
        let reject = |edit: MeetingEdit| f.access.edit("m", &edit).unwrap_err();

        assert!(matches!(
            reject(MeetingEdit::default()),
            AccessError::Invalid(_)
        ));
        assert_eq!(
            reject(MeetingEdit {
                title: Some("  ".into()),
                ..MeetingEdit::default()
            }),
            AccessError::Invalid("title must be non-empty".into())
        );
        assert_eq!(
            reject(MeetingEdit {
                summary: Some("\n".into()),
                ..MeetingEdit::default()
            }),
            AccessError::Invalid("summary must be non-empty".into())
        );
        let huge = "x".repeat(MAX_NOTE_BYTES + 1);
        assert!(matches!(
            reject(MeetingEdit {
                context: Some(huge.clone()),
                ..MeetingEdit::default()
            }),
            AccessError::Invalid(_)
        ));
        assert!(matches!(
            reject(MeetingEdit {
                title: Some("t".repeat(MAX_TITLE_CHARS + 1)),
                ..MeetingEdit::default()
            }),
            AccessError::Invalid(_)
        ));
        assert_eq!(f.app.get_record("m").unwrap().meeting.title, "m");
    }

    #[test]
    fn works_when_the_app_is_closed_and_no_wal_files_exist() {
        let dir = std::env::temp_dir().join(format!("amie-access-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("meetings.db");
        {
            let app = MeetingStore::open(&path).unwrap();
            finished(&app, "m", 1_000);
        }
        for suffix in ["-wal", "-shm"] {
            let mut name = path.clone().into_os_string();
            name.push(suffix);
            assert!(
                !Path::new(&name).exists(),
                "closing the app removes {suffix}"
            );
        }
        let access = AgentAccess::open(&path).unwrap();
        assert_eq!(access.get("m").unwrap().record.meeting.id, "m");
        assert!(access.archive("m").unwrap().archived_at.is_some());
        assert_eq!(
            access
                .list(&MeetingListFilter {
                    status: None,
                    start_ms: None,
                    end_ms: None,
                    include_archived: true,
                    cursor: None,
                    limit: 10,
                })
                .unwrap()
                .meetings
                .len(),
            1
        );
    }

    #[test]
    fn writes_are_rejected_while_a_meeting_is_live() {
        let f = fixture();
        f.app.insert_live_meeting("live", 1_000, "Live").unwrap();
        let edit = MeetingEdit {
            title: Some("Renamed".into()),
            ..MeetingEdit::default()
        };
        assert_eq!(f.access.edit("live", &edit).unwrap_err(), AccessError::Live);
        assert_eq!(f.access.archive("live").unwrap_err(), AccessError::Live);
        assert_eq!(f.access.unarchive("live").unwrap_err(), AccessError::Live);
        let record = f.app.get_record("live").unwrap();
        assert_eq!(record.meeting.title, "Live");
        assert_eq!(record.meeting.status, "live");

        // Reads still work, and the meeting becomes writable once finished.
        assert!(f.access.get("live").is_ok());
        f.app.finish_meeting("live", 2_000).unwrap();
        assert!(f.access.edit("live", &edit).is_ok());
    }

    #[test]
    fn archive_and_unarchive_are_idempotent_and_keep_the_first_timestamp() {
        let f = fixture();
        finished(&f.app, "m", 1_000);
        let first = f.access.archive("m").unwrap();
        let stamp = first.archived_at.expect("archived");
        std::thread::sleep(Duration::from_millis(3));
        let again = f.access.archive("m").unwrap();
        assert_eq!(again.archived_at, Some(stamp));
        assert!(f.app.list_finished().unwrap().is_empty());

        let restored = f.access.unarchive("m").unwrap();
        assert_eq!(restored.archived_at, None);
        assert_eq!(f.access.unarchive("m").unwrap().archived_at, None);
        assert_eq!(f.app.list_finished().unwrap().len(), 1);
    }

    #[test]
    fn missing_meetings_are_not_found() {
        let f = fixture();
        assert_eq!(f.access.get("nope").unwrap_err(), AccessError::NotFound);
        assert_eq!(f.access.archive("nope").unwrap_err(), AccessError::NotFound);
        assert_eq!(
            f.access
                .edit(
                    "nope",
                    &MeetingEdit {
                        title: Some("x".into()),
                        ..MeetingEdit::default()
                    }
                )
                .unwrap_err(),
            AccessError::NotFound
        );
        assert_eq!(
            f.access
                .page_transcript(&SegmentPageQuery {
                    meeting_id: "nope".into(),
                    cursor: None,
                    limit: 10
                })
                .unwrap_err(),
            AccessError::NotFound
        );
    }

    #[test]
    fn no_write_changes_the_transcript() {
        let f = fixture();
        finished(&f.app, "m", 1_000);
        f.app
            .insert_segment("s1", "m", 0, 10, "hello there", "User", "mic")
            .unwrap();
        f.app
            .insert_segment("s2", "m", 10, 20, "general kenobi", "Remote", "system")
            .unwrap();
        let before = segments_of(&f.app, "m");

        f.access
            .edit(
                "m",
                &MeetingEdit {
                    title: Some("T".into()),
                    context: Some("C".into()),
                    summary: Some("S".into()),
                },
            )
            .unwrap();
        f.access.archive("m").unwrap();
        f.access.unarchive("m").unwrap();

        assert_eq!(segments_of(&f.app, "m"), before);
        assert_eq!(f.app.segment_count("m").unwrap(), 2);
    }

    #[test]
    fn reads_and_writes_coexist_with_the_app_writing_a_live_meeting() {
        let f = fixture();
        finished(&f.app, "old", 1_000);
        f.app.insert_live_meeting("live", 5_000, "Live").unwrap();
        f.app
            .insert_segment("s1", "live", 0, 10, "first words", "User", "mic")
            .unwrap();

        f.access.archive("old").unwrap();
        f.app
            .insert_segment("s2", "live", 10, 20, "more words", "User", "mic")
            .unwrap();

        let live = f.access.live().unwrap().unwrap();
        assert_eq!(live.record.segments.len(), 2);
        assert_eq!(f.app.get_record("old").unwrap().meeting.status, "finished");
    }
}
