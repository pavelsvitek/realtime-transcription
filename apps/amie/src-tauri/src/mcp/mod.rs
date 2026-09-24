//! Local stdio MCP server for Amie meetings.
//!
//! stdout is the MCP protocol. Log only to stderr.

use std::path::PathBuf;

use base64::Engine;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock};
use rmcp::service::ServiceExt;
use rmcp::{tool, tool_handler, tool_router, ErrorData, ServerHandler};
use schemars::JsonSchema;
use serde::de::Deserializer;
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::AppError;
use crate::ipc::meetings::{MeetingRecord, MeetingSegment, PatchMeeting};
use crate::meetings::{
    default_db_path, now_ms, schema_version, McpListFilter, McpSearch, McpSearchHit,
    McpSearchScope, McpSegmentPageQuery, MeetingStore,
};

const TRANSCRIPT_CHAR_LIMIT: usize = 32_000;
const SIX_MONTHS_MS: i64 = 183 * 24 * 60 * 60 * 1000;
#[derive(Clone)]
pub struct AmieMcp {
    store: MeetingStore,
}

#[tool_router]
impl AmieMcp {
    #[tool(
        description = "List meetings, newest first. Defaults to finished, non-archived meetings.",
        annotations(read_only_hint = true)
    )]
    fn list_meetings(
        &self,
        Parameters(args): Parameters<ListMeetingsArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(list_meetings(&self.store, &args))
    }

    #[tool(
        description = "Get one meeting: summary, context, participants, and a transcript preview. If transcriptTruncated is true, call get_meeting_transcript.",
        annotations(read_only_hint = true)
    )]
    fn get_meeting(
        &self,
        Parameters(args): Parameters<MeetingIdArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(get_meeting(&self.store, &args.meeting_id))
    }

    #[tool(
        description = "Page a meeting transcript. Use after get_meeting when transcriptTruncated is true.",
        annotations(read_only_hint = true)
    )]
    fn get_meeting_transcript(
        &self,
        Parameters(args): Parameters<TranscriptArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(get_meeting_transcript(&self.store, &args))
    }

    #[tool(
        description = "Keyword search across meetings (not semantic). Defaults to the last 6 months and excludes archived meetings. Live meetings are included.",
        annotations(read_only_hint = true)
    )]
    fn search_meetings(
        &self,
        Parameters(args): Parameters<SearchMeetingsArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(search_meetings(&self.store, &args, now_ms()))
    }

    #[tool(
        description = "Return the in-progress meeting, or meeting: null when nothing is live.",
        annotations(read_only_hint = true)
    )]
    fn get_live_meeting(&self) -> Result<CallToolResult, ErrorData> {
        tool_result(get_live_meeting(&self.store))
    }

    #[tool(
        description = "Patch a meeting. Omitted fields stay unchanged. Empty context clears it. archivedAt as null unarchives."
    )]
    fn update_meeting(
        &self,
        Parameters(args): Parameters<UpdateMeetingArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(update_meeting(&self.store, &args))
    }

    #[tool(
        description = "Permanently delete a meeting and its transcript. Irreversible. Confirm with the user before calling.",
        annotations(destructive_hint = true, read_only_hint = false)
    )]
    fn delete_meeting(
        &self,
        Parameters(args): Parameters<MeetingIdArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        tool_result(delete_meeting(&self.store, &args.meeting_id))
    }

    #[tool(
        description = "Which Amie database this server opened.",
        annotations(read_only_hint = true)
    )]
    fn get_account_info(&self) -> Result<CallToolResult, ErrorData> {
        tool_result(get_account_info(&self.store))
    }
}

#[tool_handler(
    name = "amie",
    version = "0.1.0",
    instructions = "Amie MCP reads meetings stored on this Mac. Use list_meetings or search_meetings (keyword, last 6 months by default) to find a meeting, then get_meeting. If transcriptTruncated is true, page the rest with get_meeting_transcript. Use get_live_meeting for the meeting currently being captured. Confirm with the user before delete_meeting."
)]
impl ServerHandler for AmieMcp {}

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    let path = db_path_from_env();
    let store = MeetingStore::open_shared(&path)?;
    let server = AmieMcp { store }.serve(rmcp::transport::stdio()).await?;
    server.waiting().await?;
    Ok(())
}

fn db_path_from_env() -> PathBuf {
    match std::env::var("AMIE_DB_PATH") {
        Ok(path) if !path.is_empty() => PathBuf::from(path),
        _ => default_db_path(),
    }
}

fn tool_result(result: Result<Value, String>) -> Result<CallToolResult, ErrorData> {
    match result {
        Ok(value) => Ok(CallToolResult::structured(value)),
        Err(message) => Ok(CallToolResult::error(vec![ContentBlock::text(message)])),
    }
}

fn map_store(err: AppError) -> String {
    let text = err.to_string();
    let lower = text.to_lowercase();
    if lower.contains("locked") {
        "database locked".into()
    } else if lower.contains("not found") {
        "meeting not found".into()
    } else {
        text
    }
}

#[derive(Debug, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(rename_all = "camelCase")]
struct ListMeetingsArgs {
    limit: Option<u32>,
    cursor: Option<String>,
    start_date: Option<String>,
    end_date: Option<String>,
    include_archived: Option<bool>,
    status: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename_all = "camelCase")]
struct MeetingIdArgs {
    meeting_id: String,
}

#[derive(Debug, Deserialize, JsonSchema, Default)]
#[serde(rename_all = "camelCase")]
#[schemars(rename_all = "camelCase")]
struct TranscriptArgs {
    meeting_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    format: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename_all = "camelCase")]
struct SearchMeetingsArgs {
    query: String,
    start_date: Option<String>,
    end_date: Option<String>,
    limit: Option<u32>,
    scope: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "camelCase")]
#[schemars(rename_all = "camelCase")]
struct UpdateMeetingArgs {
    meeting_id: String,
    title: Option<String>,
    context: Option<String>,
    summary: Option<String>,
    #[serde(default, deserialize_with = "deserialize_archive_update")]
    #[schemars(with = "Option<String>")]
    archived_at: ArchiveUpdate,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
enum ArchiveUpdate {
    #[default]
    Unchanged,
    Clear,
    Set(String),
}

fn deserialize_archive_update<'de, D>(deserializer: D) -> Result<ArchiveUpdate, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    Ok(match value {
        None => ArchiveUpdate::Clear,
        Some(text) => ArchiveUpdate::Set(text),
    })
}

fn list_meetings(store: &MeetingStore, args: &ListMeetingsArgs) -> Result<Value, String> {
    let status = match args.status.as_deref().unwrap_or("finished") {
        "finished" => Some("finished".to_string()),
        "live" => Some("live".to_string()),
        "all" => None,
        other => return Err(format!("invalid status: {other}")),
    };
    let cursor = match &args.cursor {
        Some(raw) => Some(decode_cursor(raw)?),
        None => None,
    };
    let page = store
        .list_for_mcp(&McpListFilter {
            status,
            start_ms: optional_time(&args.start_date, false)?,
            end_ms: optional_time(&args.end_date, true)?,
            include_archived: args.include_archived.unwrap_or(false),
            cursor,
            limit: clamp_limit(args.limit, 50, 100),
        })
        .map_err(map_store)?;
    let meetings: Vec<Value> = page
        .meetings
        .iter()
        .map(|row| {
            json!({
                "id": row.id,
                "title": row.title,
                "startedAt": iso_from_ms(row.started_at),
                "finishedAt": row.finished_at.map(iso_from_ms),
                "teaser": row.teaser,
                "status": row.status,
            })
        })
        .collect();
    Ok(json!({
        "meetings": meetings,
        "nextCursor": page.next_cursor.as_ref().map(|(started, id)| encode_cursor(*started, id)),
    }))
}

fn get_meeting(store: &MeetingStore, meeting_id: &str) -> Result<Value, String> {
    let record = store
        .find_record(meeting_id)
        .map_err(map_store)?
        .ok_or_else(|| "meeting not found".to_string())?;
    let archived_at = store.archived_at(meeting_id).map_err(map_store)?;
    Ok(meeting_value(&record, archived_at))
}

fn get_meeting_transcript(store: &MeetingStore, args: &TranscriptArgs) -> Result<Value, String> {
    let format = match args.format.as_deref().unwrap_or("json") {
        "json" | "markdown" => args.format.as_deref().unwrap_or("json"),
        other => return Err(format!("invalid format: {other}")),
    };
    let cursor = match &args.cursor {
        Some(raw) => Some(decode_cursor(raw)?),
        None => None,
    };
    let page = store
        .page_segments(&McpSegmentPageQuery {
            meeting_id: args.meeting_id.clone(),
            cursor,
            limit: clamp_limit(args.limit, 200, 500),
        })
        .map_err(map_store)?;
    let next = page
        .next_cursor
        .as_ref()
        .map(|(start, id)| encode_cursor(*start, id));
    if format == "markdown" {
        return Ok(json!({
            "meetingId": args.meeting_id,
            "format": "markdown",
            "markdown": markdown_segments(&page.segments),
            "nextCursor": next,
        }));
    }
    let segments: Vec<Value> = page
        .segments
        .iter()
        .map(|seg| {
            json!({
                "id": seg.id,
                "startMs": seg.start_ms,
                "endMs": seg.end_ms,
                "text": seg.text,
                "speaker": seg.speaker,
                "stream": seg.stream,
            })
        })
        .collect();
    Ok(json!({
        "meetingId": args.meeting_id,
        "format": "json",
        "segments": segments,
        "nextCursor": next,
    }))
}

fn search_meetings(
    store: &MeetingStore,
    args: &SearchMeetingsArgs,
    now: i64,
) -> Result<Value, String> {
    let query = args.query.trim();
    if query.is_empty() {
        return Err("query must be non-empty".into());
    }
    let scope = match args.scope.as_deref().unwrap_or("all") {
        "all" => McpSearchScope::All,
        "title" => McpSearchScope::Title,
        "summary" => McpSearchScope::Summary,
        "transcript" => McpSearchScope::Transcript,
        other => return Err(format!("invalid scope: {other}")),
    };
    let start_ms = match &args.start_date {
        Some(raw) => parse_iso_ms(raw, false)?,
        None => now.saturating_sub(SIX_MONTHS_MS),
    };
    let hits = store
        .search_meetings(&McpSearch {
            query: query.to_string(),
            start_ms,
            end_ms: optional_time(&args.end_date, true)?,
            limit: clamp_limit(args.limit, 20, 40),
            scope,
        })
        .map_err(map_store)?;
    let results: Vec<Value> = hits
        .iter()
        .map(|hit| search_result(hit, query, scope))
        .collect();
    Ok(json!({
        "search": "keyword",
        "results": results,
    }))
}

fn get_live_meeting(store: &MeetingStore) -> Result<Value, String> {
    let Some(detail) = store.get_live_meeting().map_err(map_store)? else {
        return Ok(json!({ "meeting": null }));
    };
    let record = store
        .find_record(&detail.id)
        .map_err(map_store)?
        .ok_or_else(|| "meeting not found".to_string())?;
    let archived_at = store.archived_at(&detail.id).map_err(map_store)?;
    Ok(json!({ "meeting": meeting_value(&record, archived_at) }))
}

fn update_meeting(store: &MeetingStore, args: &UpdateMeetingArgs) -> Result<Value, String> {
    if let Some(title) = &args.title {
        if title.trim().is_empty() {
            return Err("title must be non-empty".into());
        }
    }
    let archived_at = match &args.archived_at {
        ArchiveUpdate::Unchanged => None,
        ArchiveUpdate::Clear => Some(None),
        ArchiveUpdate::Set(raw) => Some(Some(parse_iso_ms(raw, false)?)),
    };
    if args.title.is_none() && args.context.is_none() && args.summary.is_none() && archived_at.is_none()
    {
        return get_meeting(store, &args.meeting_id);
    }
    if args.title.is_some() || args.context.is_some() || args.summary.is_some() {
        store
            .patch_meeting(
                &args.meeting_id,
                &PatchMeeting {
                    title: args.title.clone(),
                    context: args.context.clone(),
                    summary: args.summary.clone(),
                    archived_at: None,
                },
            )
            .map_err(map_store)?;
    }
    match archived_at {
        Some(Some(ms)) => store
            .set_meeting_archived_at(&args.meeting_id, ms)
            .map_err(map_store)?,
        Some(None) => store
            .clear_archived_at(&args.meeting_id)
            .map_err(map_store)?,
        None => {}
    }
    get_meeting(store, &args.meeting_id)
}

fn delete_meeting(store: &MeetingStore, meeting_id: &str) -> Result<Value, String> {
    store.delete_meeting(meeting_id).map_err(map_store)?;
    Ok(json!({
        "deleted": true,
        "meetingId": meeting_id,
    }))
}

fn get_account_info(store: &MeetingStore) -> Result<Value, String> {
    Ok(json!({
        "app": "amie",
        "deviceId": store.device_id(),
        "dbPath": store.path().display().to_string(),
        "schemaVersion": schema_version(),
    }))
}

fn meeting_value(record: &MeetingRecord, archived_at: Option<i64>) -> Value {
    let (transcript, truncated) = preview_transcript(&record.segments);
    json!({
        "id": record.meeting.id,
        "title": record.meeting.title,
        "startedAt": iso_from_ms(record.meeting.started_at),
        "finishedAt": record.meeting.finished_at.map(iso_from_ms),
        "status": record.meeting.status,
        "context": record.meeting.context,
        "summary": record.meeting.summary,
        "teaser": record.meeting.teaser,
        "participants": participants(&record.segments),
        "transcript": transcript,
        "transcriptTruncated": truncated,
        "transcriptSegmentCount": record.segments.len(),
        "archivedAt": archived_at.map(iso_from_ms),
    })
}

fn search_result(hit: &McpSearchHit, query: &str, scope: McpSearchScope) -> Value {
    let title_hit = scope != McpSearchScope::Summary
        && scope != McpSearchScope::Transcript
        && contains_ignore_ascii_case(&hit.title, query);
    let summary_hit = scope != McpSearchScope::Title
        && scope != McpSearchScope::Transcript
        && hit
            .summary
            .as_deref()
            .is_some_and(|text| contains_ignore_ascii_case(text, query));
    let (match_field, source) = if title_hit {
        ("title", hit.title.as_str())
    } else if summary_hit {
        ("summary", hit.summary.as_deref().unwrap_or(""))
    } else {
        ("transcript", hit.transcript_hit.as_deref().unwrap_or(""))
    };
    json!({
        "meetingId": hit.meeting_id,
        "title": hit.title,
        "startedAt": iso_from_ms(hit.started_at),
        "snippet": snippet(source, query),
        "matchField": match_field,
    })
}

fn preview_transcript(segments: &[MeetingSegment]) -> (Option<String>, bool) {
    if segments.is_empty() {
        return (None, false);
    }
    let mut out = String::new();
    for (index, seg) in segments.iter().enumerate() {
        let block = segment_markdown(seg);
        let extra = if out.is_empty() {
            block.len()
        } else {
            2 + block.len()
        };
        if out.len() + extra > TRANSCRIPT_CHAR_LIMIT {
            return (Some(out), true);
        }
        if index > 0 {
            out.push_str("\n\n");
        }
        out.push_str(&block);
    }
    (Some(out), false)
}

fn markdown_segments(segments: &[MeetingSegment]) -> String {
    segments
        .iter()
        .map(segment_markdown)
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn segment_markdown(seg: &MeetingSegment) -> String {
    let speaker = if seg.speaker.is_empty() {
        "Speaker"
    } else {
        seg.speaker.as_str()
    };
    format!("**{speaker}**: {}", seg.text)
}

fn participants(segments: &[MeetingSegment]) -> Vec<String> {
    let mut out = Vec::new();
    for seg in segments {
        if seg.speaker.is_empty() || out.iter().any(|seen| seen == &seg.speaker) {
            continue;
        }
        out.push(seg.speaker.clone());
    }
    out
}

fn snippet(text: &str, query: &str) -> String {
    let lower_text = text.to_lowercase();
    let lower_query = query.to_lowercase();
    let Some(byte_idx) = lower_text.find(&lower_query) else {
        return truncate_chars(text, 120);
    };
    let start = floor_char(text, byte_idx.saturating_sub(40));
    let end = ceil_char(text, (byte_idx + lower_query.len() + 40).min(text.len()));
    let mut snippet = text[start..end].to_string();
    if start > 0 {
        snippet.insert(0, '…');
    }
    if end < text.len() {
        snippet.push('…');
    }
    snippet
}

fn contains_ignore_ascii_case(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(&needle.to_lowercase())
}

fn clamp_limit(value: Option<u32>, default: u32, max: u32) -> u32 {
    value.unwrap_or(default).clamp(1, max)
}

fn optional_time(raw: &Option<String>, end_of_day: bool) -> Result<Option<i64>, String> {
    match raw {
        Some(text) => Ok(Some(parse_iso_ms(text, end_of_day)?)),
        None => Ok(None),
    }
}

fn encode_cursor(primary: i64, id: &str) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(format!("{primary}\n{id}"))
}

fn decode_cursor(raw: &str) -> Result<(i64, String), String> {
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(raw)
        .map_err(|_| "invalid cursor".to_string())?;
    let text = String::from_utf8(bytes).map_err(|_| "invalid cursor".to_string())?;
    let (primary, id) = text.split_once('\n').ok_or("invalid cursor")?;
    let primary = primary.parse::<i64>().map_err(|_| "invalid cursor")?;
    if id.is_empty() {
        return Err("invalid cursor".into());
    }
    Ok((primary, id.to_string()))
}

fn iso_from_ms(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let millis = ms.rem_euclid(1000);
    let days = secs.div_euclid(86_400);
    let tod = secs.rem_euclid(86_400) as u32;
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        tod / 3600,
        (tod % 3600) / 60,
        tod % 60
    )
}

fn parse_iso_ms(raw: &str, end_of_day: bool) -> Result<i64, String> {
    let text = raw.trim();
    if text.len() == 10 {
        let (year, month, day) = parse_ymd(&text[0..10])?;
        let mut ms = ymd_hms_to_ms(year, month, day, 0, 0, 0)?;
        if end_of_day {
            ms += 86_400_000 - 1;
        }
        return Ok(ms);
    }
    if text.len() < 20 || text.as_bytes().get(10) != Some(&b'T') {
        return Err(format!("invalid date: {raw}"));
    }
    let (year, month, day) = parse_ymd(&text[0..10])?;
    let hour: u32 = text[11..13].parse().map_err(|_| format!("invalid date: {raw}"))?;
    let minute: u32 = text[14..16]
        .parse()
        .map_err(|_| format!("invalid date: {raw}"))?;
    let second: u32 = text[17..19]
        .parse()
        .map_err(|_| format!("invalid date: {raw}"))?;
    if text.as_bytes().get(13) != Some(&b':') || text.as_bytes().get(16) != Some(&b':') {
        return Err(format!("invalid date: {raw}"));
    }
    let mut rest = &text[19..];
    let mut millis = 0_i64;
    if let Some(stripped) = rest.strip_prefix('.') {
        let digits: String = stripped.chars().take_while(|ch| ch.is_ascii_digit()).collect();
        if digits.is_empty() {
            return Err(format!("invalid date: {raw}"));
        }
        let padded = format!("{digits:0<3}");
        millis = padded[..3].parse().unwrap_or(0);
        rest = &stripped[digits.len()..];
    }
    let mut ms = ymd_hms_to_ms(year, month, day, hour, minute, second)? + millis;
    if rest == "Z" || rest.is_empty() {
        return Ok(ms);
    }
    let (sign, offset) = if let Some(rest) = rest.strip_prefix('+') {
        (1_i64, rest)
    } else if let Some(rest) = rest.strip_prefix('-') {
        (-1_i64, rest)
    } else {
        return Err(format!("invalid date: {raw}"));
    };
    if offset.len() != 5 || offset.as_bytes().get(2) != Some(&b':') {
        return Err(format!("invalid date: {raw}"));
    }
    let off_h: i64 = offset[..2]
        .parse()
        .map_err(|_| format!("invalid date: {raw}"))?;
    let off_m: i64 = offset[3..]
        .parse()
        .map_err(|_| format!("invalid date: {raw}"))?;
    ms -= sign * (off_h * 3_600_000 + off_m * 60_000);
    Ok(ms)
}

fn parse_ymd(text: &str) -> Result<(i32, u32, u32), String> {
    if text.len() != 10 || text.as_bytes()[4] != b'-' || text.as_bytes()[7] != b'-' {
        return Err(format!("invalid date: {text}"));
    }
    let year: i32 = text[0..4]
        .parse()
        .map_err(|_| format!("invalid date: {text}"))?;
    let month: u32 = text[5..7]
        .parse()
        .map_err(|_| format!("invalid date: {text}"))?;
    let day: u32 = text[8..10]
        .parse()
        .map_err(|_| format!("invalid date: {text}"))?;
    Ok((year, month, day))
}

fn ymd_hms_to_ms(
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
    second: u32,
) -> Result<i64, String> {
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return Err(format!("invalid date: {year:04}-{month:02}-{day:02}"));
    }
    if hour > 23 || minute > 59 || second > 59 {
        return Err("invalid time".into());
    }
    let days = days_from_civil(year, month, day);
    Ok(days * 86_400_000 + i64::from(hour) * 3_600_000 + i64::from(minute) * 60_000 + i64::from(second) * 1000)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap(year) => 29,
        2 => 28,
        _ => 0,
    }
}

fn is_leap(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let y = if month <= 2 { year - 1 } else { year } as i64;
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as u32;
    let m = month as i64;
    let doy = (153 * (m + if m > 2 { -3 } else { 9 }) + 2) / 5 + day as i64 - 1;
    let doe = yoe as i64 * 365 + yoe as i64 / 4 - yoe as i64 / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    (year as i32, month, day)
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn floor_char(text: &str, index: usize) -> usize {
    let mut idx = index.min(text.len());
    while idx > 0 && !text.is_char_boundary(idx) {
        idx -= 1;
    }
    idx
}

fn ceil_char(text: &str, index: usize) -> usize {
    let mut idx = index.min(text.len());
    while idx < text.len() && !text.is_char_boundary(idx) {
        idx += 1;
    }
    idx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::meetings::MeetingStore;
    use uuid::Uuid;

    fn temp_store() -> MeetingStore {
        let dir = std::env::temp_dir().join(format!("amie-mcp-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        MeetingStore::open(&dir.join("meetings.db")).unwrap()
    }

    fn finish(store: &MeetingStore, id: &str, started: i64) {
        store.insert_live_meeting(id, started, id).unwrap();
        store.finish_meeting(id, started + 60_000).unwrap();
    }

    #[test]
    fn list_filters_cursor_and_archive() {
        let store = temp_store();
        finish(&store, "a", 3_000);
        finish(&store, "b", 2_000);
        finish(&store, "c", 1_000);
        store.archive_meeting("c").unwrap();
        store.insert_live_meeting("live", 4_000, "live").unwrap();

        let page = list_meetings(&store, &ListMeetingsArgs {
            limit: Some(1),
            ..ListMeetingsArgs::default()
        })
        .unwrap();
        assert_eq!(page["meetings"][0]["id"], "a");
        let cursor = page["nextCursor"].as_str().unwrap().to_string();

        let next = list_meetings(
            &store,
            &ListMeetingsArgs {
                limit: Some(10),
                cursor: Some(cursor),
                ..ListMeetingsArgs::default()
            },
        )
        .unwrap();
        let ids: Vec<_> = next["meetings"]
            .as_array()
            .unwrap()
            .iter()
            .map(|row| row["id"].as_str().unwrap())
            .collect();
        assert_eq!(ids, ["b"]);

        let with_archived = list_meetings(
            &store,
            &ListMeetingsArgs {
                include_archived: Some(true),
                limit: Some(10),
                ..ListMeetingsArgs::default()
            },
        )
        .unwrap();
        assert_eq!(with_archived["meetings"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn transcript_truncates_and_pages() {
        let store = temp_store();
        finish(&store, "m", 1_000);
        let text = "x".repeat(20_000);
        for index in 0..3 {
            store
                .insert_segment(
                    &format!("s{index}"),
                    "m",
                    index * 1_000,
                    index * 1_000 + 500,
                    &text,
                    "User",
                    "mic",
                )
                .unwrap();
        }
        let meeting = get_meeting(&store, "m").unwrap();
        assert_eq!(meeting["transcriptTruncated"], true);
        assert_eq!(meeting["transcriptSegmentCount"], 3);
        assert!(meeting["transcript"].as_str().unwrap().contains("**User**:"));

        let page = get_meeting_transcript(
            &store,
            &TranscriptArgs {
                meeting_id: "m".into(),
                limit: Some(2),
                ..TranscriptArgs::default()
            },
        )
        .unwrap();
        assert_eq!(page["segments"].as_array().unwrap().len(), 2);
        let cursor = page["nextCursor"].as_str().unwrap().to_string();
        let rest = get_meeting_transcript(
            &store,
            &TranscriptArgs {
                meeting_id: "m".into(),
                cursor: Some(cursor),
                limit: Some(2),
                ..TranscriptArgs::default()
            },
        )
        .unwrap();
        assert_eq!(rest["segments"].as_array().unwrap().len(), 1);
        assert!(rest["nextCursor"].is_null());
    }

    #[test]
    fn search_prefers_title_and_skips_old_meetings() {
        let store = temp_store();
        let now = 1_800_000_000_000;
        finish(&store, "title-hit", now - 1_000);
        store.update_title("title-hit", "pricing review").unwrap();
        store
            .update_summary("title-hit", "summary mentions pricing too")
            .unwrap();
        finish(&store, "body-hit", now - 2_000);
        store.update_title("body-hit", "standup").unwrap();
        store
            .insert_segment("seg", "body-hit", 0, 10, "we discussed pricing", "Remote", "system")
            .unwrap();
        finish(&store, "old", now - SIX_MONTHS_MS - 86_400_000);
        store.update_title("old", "old pricing").unwrap();

        let found = search_meetings(
            &store,
            &SearchMeetingsArgs {
                query: "pricing".into(),
                start_date: None,
                end_date: None,
                limit: None,
                scope: None,
            },
            now,
        )
        .unwrap();
        let results = found["results"].as_array().unwrap();
        assert_eq!(found["search"], "keyword");
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["meetingId"], "title-hit");
        assert_eq!(results[0]["matchField"], "title");
        assert_eq!(results[1]["matchField"], "transcript");
    }

    #[test]
    fn update_unarchives_and_rejects_blank_title() {
        let store = temp_store();
        finish(&store, "m", 5_000);
        store.archive_meeting("m").unwrap();
        let cleared = update_meeting(
            &store,
            &UpdateMeetingArgs {
                meeting_id: "m".into(),
                title: None,
                context: Some(String::new()),
                summary: None,
                archived_at: ArchiveUpdate::Clear,
            },
        )
        .unwrap();
        assert!(cleared["archivedAt"].is_null());
        assert!(cleared["context"].is_null());

        let err = update_meeting(
            &store,
            &UpdateMeetingArgs {
                meeting_id: "m".into(),
                title: Some("  ".into()),
                context: None,
                summary: None,
                archived_at: ArchiveUpdate::Unchanged,
            },
        )
        .unwrap_err();
        assert_eq!(err, "title must be non-empty");
    }

    #[test]
    fn delete_missing_is_an_error() {
        let store = temp_store();
        let err = delete_meeting(&store, "missing").unwrap_err();
        assert_eq!(err, "meeting not found");
    }

    #[test]
    fn live_meeting_null_then_present() {
        let store = temp_store();
        assert!(get_live_meeting(&store).unwrap()["meeting"].is_null());
        store.insert_live_meeting("live", 9_000, "Now").unwrap();
        let live = get_live_meeting(&store).unwrap();
        assert_eq!(live["meeting"]["id"], "live");
        assert_eq!(live["meeting"]["status"], "live");
    }

    #[test]
    fn account_info_names_the_database() {
        let store = temp_store();
        let info = get_account_info(&store).unwrap();
        assert_eq!(info["app"], "amie");
        assert_eq!(info["schemaVersion"], schema_version());
        assert!(info["dbPath"].as_str().unwrap().ends_with("meetings.db"));
    }

    #[test]
    fn archive_json_distinguishes_null_from_absent() {
        let absent: UpdateMeetingArgs =
            serde_json::from_value(json!({"meetingId": "m"})).unwrap();
        assert_eq!(absent.archived_at, ArchiveUpdate::Unchanged);
        let clear: UpdateMeetingArgs =
            serde_json::from_value(json!({"meetingId": "m", "archivedAt": null})).unwrap();
        assert_eq!(clear.archived_at, ArchiveUpdate::Clear);
    }
}
