use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tauri::async_runtime::JoinHandle;

use super::keys::{provider_has_api_key, resolve_provider};
use super::output::parse_meeting_output;
use super::provider::{create_client, missing_key_message, LlmClient, LlmError};
use crate::ipc::summary::{
    GenerateAllSummariesResult, SummaryDelta, SummaryJobSnapshot, SummaryJobState, SummaryStatus,
};
use crate::meetings::MeetingStore;

const MEETING_SUMMARY_PROMPT: &str = include_str!("../../prompts/meeting-summary.txt");

/// Automatic summaries wait until the meeting has lasted this long.
pub const AUTO_SUMMARY_MIN_MS: i64 = 5 * 60 * 1000;

/// Meetings shorter than 5 minutes stay unsummarized until the user asks.
pub fn meeting_skips_auto_summary(started_at: i64, finished_at: i64) -> bool {
    finished_at.saturating_sub(started_at) < AUTO_SUMMARY_MIN_MS
}

pub type SummaryEmitter = Arc<dyn Fn(SummaryEvent) + Send + Sync>;

#[derive(Debug, Clone)]
pub enum SummaryEvent {
    Delta(SummaryDelta),
    Status(SummaryStatus),
}

type ClientFactory = Arc<dyn Fn() -> Result<Arc<dyn LlmClient>, LlmError> + Send + Sync>;

struct JobSlot {
    generation: u64,
    handle: Option<JoinHandle<()>>,
    snapshot: SummaryJobSnapshot,
    raw: String,
}

impl JobSlot {
    fn new() -> Self {
        Self {
            generation: 0,
            handle: None,
            snapshot: SummaryJobSnapshot::idle(),
            raw: String::new(),
        }
    }
}

#[derive(Clone)]
pub struct SummaryService {
    store: MeetingStore,
    jobs: Arc<Mutex<HashMap<String, JobSlot>>>,
    factory: ClientFactory,
}

impl SummaryService {
    pub fn new(store: MeetingStore) -> Self {
        Self {
            store,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            factory: Arc::new(|| create_client(resolve_provider())),
        }
    }

    #[cfg(test)]
    fn with_factory(store: MeetingStore, factory: ClientFactory) -> Self {
        Self {
            store,
            jobs: Arc::new(Mutex::new(HashMap::new())),
            factory,
        }
    }

    #[cfg(test)]
    fn prime_job(&self, meeting_id: &str, generation: u64) {
        let mut jobs = self.jobs.lock().unwrap();
        let slot = jobs
            .entry(meeting_id.to_string())
            .or_insert_with(JobSlot::new);
        slot.generation = generation;
    }

    pub fn snapshot(&self, meeting_id: &str) -> SummaryJobSnapshot {
        self.jobs
            .lock()
            .unwrap()
            .get(meeting_id)
            .map(|slot| slot.snapshot.clone())
            .unwrap_or_else(SummaryJobSnapshot::idle)
    }

    /// Queue summaries for every finished meeting that has transcript text.
    /// Returns immediately; each job runs on `tauri::async_runtime::spawn`.
    pub fn start_all_finished(
        &self,
        emit: SummaryEmitter,
    ) -> Result<GenerateAllSummariesResult, String> {
        if let Err(message) = ensure_provider_key() {
            return Err(message);
        }

        let (ids, skipped_empty) =
            collect_summary_targets(&self.store).map_err(|e| e.to_user_message())?;
        for id in &ids {
            self.start(id.clone(), emit.clone());
        }
        Ok(GenerateAllSummariesResult {
            queued: ids.len() as u32,
            skipped_empty,
        })
    }

    /// Kick off a summary job. Returns immediately; the HTTP request lives on
    /// `tauri::async_runtime::spawn`. Regenerating aborts the previous request.
    pub fn start(&self, meeting_id: String, emit: SummaryEmitter) {
        let generation = {
            let mut jobs = self.jobs.lock().unwrap();
            let slot = jobs.entry(meeting_id.clone()).or_insert_with(JobSlot::new);
            if let Some(handle) = slot.handle.take() {
                handle.abort();
            }
            slot.generation = slot.generation.wrapping_add(1);
            slot.snapshot = SummaryJobSnapshot::idle();
            slot.raw.clear();
            slot.generation
        };

        let this = self.clone();
        let id_for_task = meeting_id.clone();
        let handle = tauri::async_runtime::spawn(async move {
            this.run_job(id_for_task, generation, emit).await;
        });

        let mut jobs = self.jobs.lock().unwrap();
        if let Some(slot) = jobs.get_mut(&meeting_id) {
            if slot.generation == generation {
                slot.handle = Some(handle);
            } else {
                handle.abort();
            }
        } else {
            handle.abort();
        }
    }

    async fn run_job(&self, meeting_id: String, generation: u64, emit: SummaryEmitter) {
        let record = match self.store.get_record(&meeting_id) {
            Ok(record) => record,
            Err(e) => {
                self.fail(&meeting_id, generation, &emit, e.to_user_message());
                return;
            }
        };

        let transcript = format_transcript(&record.segments);
        if transcript.trim().is_empty() {
            tracing::info!(meeting_id = %meeting_id, "Skipping summary: empty transcript");
            return;
        }
        let user_prompt = format_user_prompt(record.meeting.context.as_deref(), &transcript);

        if let Err(message) = ensure_provider_key() {
            self.fail(&meeting_id, generation, &emit, message);
            return;
        }

        let client = match (self.factory)() {
            Ok(client) => client,
            Err(e) => {
                self.fail(&meeting_id, generation, &emit, e.to_string());
                return;
            }
        };

        self.set_running(&meeting_id, generation);
        tracing::info!(
            meeting_id = %meeting_id,
            transcript_chars = transcript.len(),
            context_chars = record.meeting.context.as_deref().map(str::len).unwrap_or(0),
            "Starting meeting summary"
        );
        emit(SummaryEvent::Status(SummaryStatus {
            meeting_id: meeting_id.clone(),
            state: SummaryJobState::Running,
            error: None,
        }));

        let jobs = self.jobs.clone();
        let emit_delta = emit.clone();
        let id_for_delta = meeting_id.clone();
        let on_delta = move |delta: &str| {
            let (summary, title) = {
                let mut jobs = jobs.lock().unwrap();
                let Some(slot) = jobs.get_mut(&id_for_delta) else {
                    return;
                };
                if slot.generation != generation {
                    return;
                }
                slot.raw.push_str(delta);
                let parsed = parse_meeting_output(&slot.raw);
                slot.snapshot.draft = parsed.summary.clone();
                slot.snapshot.title = parsed.title.clone();
                (parsed.summary, parsed.title)
            };
            emit_delta(SummaryEvent::Delta(SummaryDelta {
                meeting_id: id_for_delta.clone(),
                text: summary,
                title,
            }));
        };

        let result = client
            .stream_text(MEETING_SUMMARY_PROMPT, &user_prompt, &on_delta)
            .await;

        if !self.is_current(&meeting_id, generation) {
            return;
        }

        match result {
            Ok(text) if text.trim().is_empty() => {
                self.fail(
                    &meeting_id,
                    generation,
                    &emit,
                    "The model returned an empty summary.".into(),
                );
            }
            Ok(text) => {
                let parsed = parse_meeting_output(&text);
                if parsed.summary.trim().is_empty() {
                    self.fail(
                        &meeting_id,
                        generation,
                        &emit,
                        "The model returned an empty summary.".into(),
                    );
                    return;
                }
                if let Err(e) = self.store.update_summary(&meeting_id, &parsed.summary) {
                    self.fail(&meeting_id, generation, &emit, e.to_user_message());
                    return;
                }
                if let Some(title) = parsed.title.as_deref() {
                    if let Err(e) = self.store.update_title(&meeting_id, title) {
                        self.fail(&meeting_id, generation, &emit, e.to_user_message());
                        return;
                    }
                }
                tracing::info!(
                    meeting_id = %meeting_id,
                    summary_chars = parsed.summary.len(),
                    title = parsed.title.as_deref().unwrap_or(""),
                    "Meeting summary saved"
                );
                self.set_done(
                    &meeting_id,
                    generation,
                    parsed.summary.clone(),
                    parsed.title,
                );
                emit(SummaryEvent::Status(SummaryStatus {
                    meeting_id: meeting_id.clone(),
                    state: SummaryJobState::Done,
                    error: None,
                }));
            }
            Err(LlmError::MissingApiKey(message)) => {
                self.fail(&meeting_id, generation, &emit, message.to_string());
            }
            Err(e) => {
                self.fail(&meeting_id, generation, &emit, e.to_string());
            }
        }
    }

    fn is_current(&self, meeting_id: &str, generation: u64) -> bool {
        self.jobs
            .lock()
            .unwrap()
            .get(meeting_id)
            .is_some_and(|slot| slot.generation == generation)
    }

    fn set_running(&self, meeting_id: &str, generation: u64) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(slot) = jobs.get_mut(meeting_id) {
            if slot.generation == generation {
                slot.snapshot.state = SummaryJobState::Running;
                slot.snapshot.error = None;
                slot.snapshot.draft.clear();
                slot.snapshot.title = None;
                slot.raw.clear();
            }
        }
    }

    fn set_done(&self, meeting_id: &str, generation: u64, text: String, title: Option<String>) {
        let mut jobs = self.jobs.lock().unwrap();
        if let Some(slot) = jobs.get_mut(meeting_id) {
            if slot.generation == generation {
                slot.snapshot.state = SummaryJobState::Done;
                slot.snapshot.draft = text;
                slot.snapshot.title = title;
                slot.snapshot.error = None;
            }
        }
    }

    fn fail(&self, meeting_id: &str, generation: u64, emit: &SummaryEmitter, error: String) {
        {
            let mut jobs = self.jobs.lock().unwrap();
            if let Some(slot) = jobs.get_mut(meeting_id) {
                if slot.generation != generation {
                    return;
                }
                slot.snapshot.state = SummaryJobState::Error;
                slot.snapshot.error = Some(error.clone());
            }
        }
        tracing::error!(meeting_id = %meeting_id, error = %error, "Meeting summary failed");
        emit(SummaryEvent::Status(SummaryStatus {
            meeting_id: meeting_id.to_string(),
            state: SummaryJobState::Error,
            error: Some(error),
        }));
    }
}

fn ensure_provider_key() -> Result<(), String> {
    let id = resolve_provider();
    if provider_has_api_key(id) {
        Ok(())
    } else {
        Err(missing_key_message(id).to_string())
    }
}

fn collect_summary_targets(
    store: &MeetingStore,
) -> Result<(Vec<String>, u32), crate::error::AppError> {
    let items = store.list_finished()?;
    let mut ids = Vec::new();
    let mut skipped_empty = 0u32;
    for item in items {
        let record = store.get_record(&item.id)?;
        if format_transcript(&record.segments).trim().is_empty() {
            skipped_empty += 1;
            continue;
        }
        if let Some(finished_at) = record.meeting.finished_at {
            if meeting_skips_auto_summary(record.meeting.started_at, finished_at) {
                tracing::info!(
                    meeting_id = %item.id,
                    "Skipping automatic summary: meeting shorter than 5 minutes"
                );
                continue;
            }
        }
        ids.push(item.id);
    }
    Ok((ids, skipped_empty))
}

fn format_transcript(segments: &[crate::ipc::meetings::MeetingSegment]) -> String {
    segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_user_prompt(context: Option<&str>, transcript: &str) -> String {
    match context.map(str::trim).filter(|value| !value.is_empty()) {
        Some(context) => format!("Meeting context:\n\n{context}\n\nTranscript:\n\n{transcript}"),
        None => transcript.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::meetings::MeetingSegment;
    use std::future::Future;
    use std::pin::Pin;
    use std::sync::atomic::{AtomicBool, Ordering};
    use uuid::Uuid;

    fn temp_store() -> MeetingStore {
        let dir = std::env::temp_dir().join(format!("summary-svc-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        MeetingStore::open(&dir.join("meetings.db")).unwrap()
    }

    struct MockClient {
        called: Arc<AtomicBool>,
    }

    impl LlmClient for MockClient {
        fn stream_text<'a>(
            &'a self,
            _system: &'a str,
            _user: &'a str,
            _on_delta: &'a (dyn Fn(&str) + Send + Sync),
        ) -> Pin<Box<dyn Future<Output = Result<String, LlmError>> + Send + 'a>> {
            self.called.store(true, Ordering::SeqCst);
            Box::pin(async { Ok("should not be called".into()) })
        }
    }

    struct FixedClient {
        text: String,
    }

    impl LlmClient for FixedClient {
        fn stream_text<'a>(
            &'a self,
            _system: &'a str,
            _user: &'a str,
            on_delta: &'a (dyn Fn(&str) + Send + Sync),
        ) -> Pin<Box<dyn Future<Output = Result<String, LlmError>> + Send + 'a>> {
            let text = self.text.clone();
            Box::pin(async move {
                on_delta(&text);
                Ok(text)
            })
        }
    }

    #[tokio::test]
    async fn run_job_persists_title_and_strips_it_from_summary() {
        let store = temp_store();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store
            .insert_segment("m1:s1", "m1", 0, 10, "Switzerland POC scope", "User", "mic")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        std::env::set_var("XAI_API_KEY", "test-key");
        let factory: ClientFactory = Arc::new(|| {
            Ok(Arc::new(FixedClient {
                text: "Title: Switzerland POC\n\n- **UBS** keeps the engine\n".into(),
            }) as Arc<dyn LlmClient>)
        });
        let service = SummaryService::with_factory(store, factory);
        service.prime_job("m1", 1);
        let emit: SummaryEmitter = Arc::new(|_| {});
        service.run_job("m1".into(), 1, emit).await;

        let record = service.store.get_record("m1").unwrap();
        assert_eq!(record.meeting.title, "Switzerland POC");
        assert_eq!(
            record.meeting.summary.as_deref(),
            Some("- **UBS** keeps the engine")
        );
        assert_eq!(
            record.meeting.teaser.as_deref(),
            Some("UBS keeps the engine")
        );
    }

    #[tokio::test]
    async fn empty_transcript_does_not_call_http() {
        let store = temp_store();
        store.insert_live_meeting("m1", 1_000, "Empty").unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        let called = Arc::new(AtomicBool::new(false));
        let factory_called = Arc::new(AtomicBool::new(false));
        let factory: ClientFactory = {
            let called = called.clone();
            let factory_called = factory_called.clone();
            Arc::new(move || {
                factory_called.store(true, Ordering::SeqCst);
                Ok(Arc::new(MockClient {
                    called: called.clone(),
                }) as Arc<dyn LlmClient>)
            })
        };
        let service = SummaryService::with_factory(store, factory);
        let emit: SummaryEmitter = Arc::new(|_| {});
        service.run_job("m1".into(), 1, emit).await;

        assert!(
            !factory_called.load(Ordering::SeqCst),
            "factory should not run for an empty transcript"
        );
        assert!(
            !called.load(Ordering::SeqCst),
            "HTTP client should not be called for an empty transcript"
        );
        let record = service.store.get_record("m1").unwrap();
        assert!(record.meeting.summary.is_none());
    }

    #[test]
    fn collect_summary_targets_skips_empty_transcripts() {
        let store = temp_store();
        store.insert_live_meeting("empty", 1_000, "Empty").unwrap();
        store
            .finish_meeting("empty", 1_000 + AUTO_SUMMARY_MIN_MS)
            .unwrap();
        store.insert_live_meeting("full", 3_000, "Full").unwrap();
        store
            .insert_segment("full:s1", "full", 0, 10, "hello", "Remote", "system")
            .unwrap();
        store
            .finish_meeting("full", 3_000 + AUTO_SUMMARY_MIN_MS)
            .unwrap();

        let (ids, skipped) = collect_summary_targets(&store).unwrap();
        assert_eq!(ids, vec!["full".to_string()]);
        assert_eq!(skipped, 1);
    }

    #[test]
    fn collect_summary_targets_skips_meetings_shorter_than_five_minutes() {
        let store = temp_store();
        let start = 1_000_000;
        store.insert_live_meeting("short", start, "Short").unwrap();
        store
            .insert_segment("short:s1", "short", 0, 10, "hello", "User", "mic")
            .unwrap();
        store
            .finish_meeting("short", start + AUTO_SUMMARY_MIN_MS - 1)
            .unwrap();

        store.insert_live_meeting("long", start, "Long").unwrap();
        store
            .insert_segment("long:s1", "long", 0, 10, "hello", "User", "mic")
            .unwrap();
        store
            .finish_meeting("long", start + AUTO_SUMMARY_MIN_MS)
            .unwrap();

        let (ids, skipped) = collect_summary_targets(&store).unwrap();
        assert_eq!(ids, vec!["long".to_string()]);
        assert_eq!(skipped, 0);
    }

    #[test]
    fn format_transcript_joins_non_empty_segments() {
        let segments = vec![
            MeetingSegment {
                id: "s1".into(),
                start_ms: 0,
                end_ms: 10,
                text: " hello ".into(),
                speaker: "User".into(),
                stream: "mic".into(),
            },
            MeetingSegment {
                id: "s2".into(),
                start_ms: 10,
                end_ms: 20,
                text: String::new(),
                speaker: String::new(),
                stream: String::new(),
            },
            MeetingSegment {
                id: "s3".into(),
                start_ms: 20,
                end_ms: 30,
                text: "world".into(),
                speaker: "Remote".into(),
                stream: "system".into(),
            },
        ];
        assert_eq!(format_transcript(&segments), "hello\nworld");
    }

    #[test]
    fn format_user_prompt_is_transcript_when_context_missing() {
        assert_eq!(format_user_prompt(None, "hello\nworld"), "hello\nworld");
        assert_eq!(format_user_prompt(Some("   "), "hello"), "hello");
        assert_eq!(format_user_prompt(Some(""), "hello"), "hello");
    }

    #[test]
    fn format_user_prompt_prefixes_context() {
        let prompt = format_user_prompt(Some("  Participants: Pavel, Igor  "), "hello\nworld");
        assert_eq!(
            prompt,
            "Meeting context:\n\nParticipants: Pavel, Igor\n\nTranscript:\n\nhello\nworld"
        );
    }

    #[tokio::test]
    async fn run_job_sends_meeting_context_with_transcript() {
        let store = temp_store();
        store
            .insert_live_meeting("m1", 1_000, "Untitled meeting")
            .unwrap();
        store
            .insert_segment("m1:s1", "m1", 0, 10, "Switzerland POC scope", "User", "mic")
            .unwrap();
        store
            .update_context("m1", "Participants: Pavel, Igor")
            .unwrap();
        store.finish_meeting("m1", 2_000).unwrap();

        std::env::set_var("XAI_API_KEY", "test-key");
        let captured = Arc::new(Mutex::new(None));
        let factory: ClientFactory = {
            let captured = captured.clone();
            Arc::new(move || {
                Ok(Arc::new(CaptureClient {
                    user: captured.clone(),
                    text: "Title: Switzerland POC\n\n- **Pavel Svitek** outlined scope\n".into(),
                }) as Arc<dyn LlmClient>)
            })
        };
        let service = SummaryService::with_factory(store, factory);
        service.prime_job("m1", 1);
        let emit: SummaryEmitter = Arc::new(|_| {});
        service.run_job("m1".into(), 1, emit).await;

        let user = captured.lock().unwrap().clone().expect("user prompt");
        assert!(
            user.starts_with("Meeting context:\n\nParticipants: Pavel, Igor\n\nTranscript:\n\n")
        );
        assert!(user.contains("Switzerland POC scope"));
    }

    struct CaptureClient {
        user: Arc<Mutex<Option<String>>>,
        text: String,
    }

    impl LlmClient for CaptureClient {
        fn stream_text<'a>(
            &'a self,
            _system: &'a str,
            user: &'a str,
            on_delta: &'a (dyn Fn(&str) + Send + Sync),
        ) -> Pin<Box<dyn Future<Output = Result<String, LlmError>> + Send + 'a>> {
            *self.user.lock().unwrap() = Some(user.to_string());
            let text = self.text.clone();
            Box::pin(async move {
                on_delta(&text);
                Ok(text)
            })
        }
    }
}
