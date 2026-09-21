use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::ipc::transcript::*;
use crate::llm::{emitter_from_app, SummaryService};
use crate::meetings::{now_ms, MeetingStore};
use crate::transcription::asr::LoadedEngine;
use crate::transcription::audio_source::AudioSource;
use crate::transcription::backend::AsrBackend;
use crate::transcription::capture;
use crate::transcription::cpal_capture::CaptureCounters;
use crate::transcription::debug_dump::{DebugSession, StreamCaptureStats};
use crate::transcription::flac_convert::convert_wav_to_flac_background;
use crate::transcription::transcript_store::TranscriptStore;
use crate::transcription::worker;

// Keep capture callbacks independent from CoreML inference bursts.
const AUDIO_CHANNEL_BOUND: usize = 8_192;

/// One capture + worker pair for a single audio stream.
struct StreamPair {
    worker_handle: JoinHandle<()>,
    _capture: capture::OpenedCapture,
    stream: String,
    counters: CaptureCounters,
}

struct RunningState {
    stop_flag: Arc<AtomicBool>,
    source: AudioSource,
    /// Present when `source` is `Mic` or `Both`.
    mic: Option<StreamPair>,
    /// Present when `source` is `SystemAudio` or `Both`.
    system: Option<StreamPair>,
    debug: Option<Arc<DebugSession>>,
    meeting_id: Option<String>,
}

pub struct TranscriptionService {
    running: Mutex<Option<RunningState>>,
    models: Mutex<Option<LoadedEngine>>,
    segment_counter: Arc<AtomicU64>,
    transcript: TranscriptStore,
    last_export: Mutex<Option<TranscriptExport>>,
    meetings: Option<MeetingStore>,
    summaries: Option<SummaryService>,
}

impl TranscriptionService {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(None),
            models: Mutex::new(None),
            segment_counter: Arc::new(AtomicU64::new(0)),
            transcript: TranscriptStore::new(),
            last_export: Mutex::new(None),
            meetings: None,
            summaries: None,
        }
    }

    pub fn with_store(store: MeetingStore) -> Self {
        Self {
            meetings: Some(store),
            ..Self::new()
        }
    }

    pub fn with_summaries(mut self, summaries: SummaryService) -> Self {
        self.summaries = Some(summaries);
        self
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.running.lock().unwrap().is_some()
    }

    pub fn start(
        &self,
        app_handle: AppHandle,
        source: AudioSource,
        backend: AsrBackend,
    ) -> Result<(), AppError> {
        self.start_internal(Some(app_handle), source, backend)
    }

    /// Start without a Tauri app handle (golden tests / headless runs).
    /// Backend comes from `ASR_BACKEND` (`local` default, or `xai`).
    pub fn start_headless(&self, source: AudioSource) -> Result<(), AppError> {
        self.start_internal(None, source, AsrBackend::from_env())
    }

    fn start_internal(
        &self,
        app_handle: Option<AppHandle>,
        source: AudioSource,
        backend: AsrBackend,
    ) -> Result<(), AppError> {
        let mut running = self.running.lock().unwrap();
        if running.is_some() {
            return Err(AppError::AlreadyRunning);
        }

        tracing::info!(?source, ?backend, "Starting transcription");
        self.transcript.clear();
        self.segment_counter.store(0, Ordering::Relaxed);
        *self.last_export.lock().unwrap() = None;

        let config = AppConfig::load();

        if let Some(app) = &app_handle {
            let _ = app.emit(
                event_names::STATUS,
                TranscriptionStatus {
                    active: false,
                    loading: Some(true),
                    model: None,
                    error: None,
                },
            );
        }

        self.ensure_engine_loaded(backend, &config, app_handle.as_ref())?;

        if let Some(store) = &self.meetings {
            if let Err(e) = store.finish_open_meetings(now_ms()) {
                tracing::warn!(error = %e, "Failed to close leftover live meetings");
            }
        }

        let meeting_id = if let Some(store) = &self.meetings {
            let id = uuid::Uuid::new_v4().to_string();
            store.insert_live_meeting(&id, now_ms(), "Untitled meeting")?;
            Some(id)
        } else {
            None
        };

        let debug_session = DebugSession::try_open(source, &config).map(Arc::new);

        let models_guard = self.models.lock().unwrap();
        let models = models_guard.as_ref().unwrap();
        let model_name = models.model_name.clone();

        let stop_flag = Arc::new(AtomicBool::new(false));
        let counter = self.segment_counter.clone();
        let transcript = self.transcript.clone();

        let (mic, system) = match source {
            AudioSource::Both => {
                let mic = spawn_stream_worker(
                    AudioSource::Mic,
                    models,
                    stop_flag.clone(),
                    counter.clone(),
                    transcript.clone(),
                    app_handle.clone(),
                    debug_session.clone(),
                    self.meetings.clone(),
                    meeting_id.clone(),
                )?;
                let system = spawn_stream_worker(
                    AudioSource::SystemAudio,
                    models,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    debug_session.clone(),
                    self.meetings.clone(),
                    meeting_id.clone(),
                )?;
                (Some(mic), Some(system))
            }
            AudioSource::Mic => {
                let pair = spawn_stream_worker(
                    AudioSource::Mic,
                    models,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    debug_session.clone(),
                    self.meetings.clone(),
                    meeting_id.clone(),
                )?;
                (Some(pair), None)
            }
            AudioSource::SystemAudio => {
                let pair = spawn_stream_worker(
                    AudioSource::SystemAudio,
                    models,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    debug_session.clone(),
                    self.meetings.clone(),
                    meeting_id.clone(),
                )?;
                (None, Some(pair))
            }
        };

        *running = Some(RunningState {
            stop_flag,
            source,
            mic,
            system,
            debug: debug_session,
            meeting_id,
        });

        drop(models_guard);

        if let Some(app) = &app_handle {
            let _ = app.emit(
                event_names::STATUS,
                TranscriptionStatus {
                    active: true,
                    loading: None,
                    model: Some(model_name),
                    error: None,
                },
            );
            crate::audio_device::emit_device_update(app);
        }

        tracing::info!("Transcription started");
        Ok(())
    }

    fn ensure_engine_loaded(
        &self,
        backend: AsrBackend,
        config: &AppConfig,
        app_handle: Option<&AppHandle>,
    ) -> Result<(), AppError> {
        let mut models_guard = self.models.lock().unwrap();
        if let Some(existing) = models_guard.as_ref() {
            if existing.backend == backend {
                return Ok(());
            }
            *models_guard = None;
        }

        if backend == AsrBackend::Local {
            config.validate().map_err(AppError::ModelLoad)?;
        }

        match LoadedEngine::load(config, backend) {
            Ok(loaded) => {
                *models_guard = Some(loaded);
            }
            Err(e) => {
                let msg = format!("{e:#}");
                tracing::error!(error = %msg, "ASR engine loading failed");
                if let Some(app) = app_handle {
                    let _ = app.emit(
                        event_names::STATUS,
                        TranscriptionStatus {
                            active: false,
                            loading: None,
                            model: None,
                            error: Some(msg.clone()),
                        },
                    );
                }
                return Err(AppError::ModelLoad(msg));
            }
        }

        Ok(())
    }

    pub fn stop(&self, app_handle: Option<&AppHandle>) -> Result<TranscriptExport, AppError> {
        let mut running = self.running.lock().unwrap();
        let state = match running.take() {
            Some(s) => s,
            None => {
                return Ok(self.last_export.lock().unwrap().clone().unwrap_or_else(|| {
                    self.build_export(AudioSource::Mic, self.transcript.text(), None)
                }));
            }
        };

        tracing::info!("Stopping transcription");

        state.stop_flag.store(true, Ordering::Relaxed);

        // Drop captures first to close audio channels, then join workers.
        // Both captures must be closed before either join so workers can drain and exit.
        let pairs: Vec<StreamPair> = [state.mic, state.system].into_iter().flatten().collect();
        let capture_info: Vec<(String, CaptureCounters)> = pairs
            .iter()
            .map(|pair| (pair.stream.clone(), pair.counters.clone()))
            .collect();
        let handles: Vec<JoinHandle<()>> = pairs
            .into_iter()
            .map(
                |StreamPair {
                     worker_handle,
                     _capture,
                     ..
                 }| {
                    drop(_capture);
                    worker_handle
                },
            )
            .collect();

        for handle in handles {
            if let Err(e) = handle.join() {
                tracing::error!("Worker thread panicked: {e:?}");
            }
        }

        if let (Some(store), Some(id)) = (&self.meetings, state.meeting_id.as_deref()) {
            let committed = self.transcript.text();
            match store.segment_count(id) {
                Ok(0) if !committed.is_empty() => {
                    tracing::warn!(
                        meeting_id = id,
                        chars = committed.len(),
                        "No segments persisted during capture; saving in-memory transcript"
                    );
                    if let Err(e) = store.insert_segment(
                        &format!("{id}:fallback"),
                        id,
                        0,
                        0,
                        &committed,
                    ) {
                        tracing::error!(
                            error = %e,
                            meeting_id = id,
                            "Failed to persist fallback transcript segment"
                        );
                    }
                }
                Ok(_) => {}
                Err(e) => tracing::error!(
                    error = %e,
                    meeting_id = id,
                    "Failed to count transcript segments"
                ),
            }
            if let Err(e) = store.finish_meeting(id, now_ms()) {
                tracing::error!(error = %e, meeting_id = id, "Failed to mark meeting finished");
            }
        }

        // Summary HTTP lives in a spawned task — do not await it on this stop path.
        if let (Some(summaries), Some(id)) = (self.summaries.as_ref(), state.meeting_id.clone()) {
            let emit = match app_handle {
                Some(app) => emitter_from_app(app.clone()),
                None => std::sync::Arc::new(|_| {}),
            };
            summaries.start(id, emit);
        }

        if let Some(session) = state.debug.as_ref() {
            for (stream, counters) in capture_info {
                let (captured_samples, dropped_samples, dropped_frames) = counters.stats();
                session.record_capture_stats(
                    &stream,
                    StreamCaptureStats {
                        captured_samples,
                        dropped_samples,
                        dropped_frames,
                    },
                );
            }
        }

        let wav_paths = state
            .debug
            .as_ref()
            .map(|session| session.finalize())
            .unwrap_or_default();

        if !wav_paths.is_empty() {
            convert_wav_to_flac_background(wav_paths);
        }

        let export = self.build_export(state.source, self.transcript.text(), state.meeting_id.clone());
        *self.last_export.lock().unwrap() = Some(export.clone());

        if let Some(app) = app_handle {
            let _ = app.emit(
                event_names::STATUS,
                TranscriptionStatus {
                    active: false,
                    loading: None,
                    model: None,
                    error: None,
                },
            );
        }

        tracing::info!(words = export.word_count, "Transcription stopped");
        Ok(export)
    }

    pub fn export_to_file(&self, path: &Path) -> Result<TranscriptExport, AppError> {
        let export = self
            .last_export
            .lock()
            .unwrap()
            .clone()
            .filter(|e| !e.text.is_empty())
            .unwrap_or_else(|| self.build_export(AudioSource::Mic, self.transcript.text(), None));

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Capture(format!("Failed to create export dir: {e}")))?;
        }
        fs::write(path, &export.text)
            .map_err(|e| AppError::Capture(format!("Failed to write transcript: {e}")))?;

        tracing::info!(path = %path.display(), words = export.word_count, "Transcript exported");
        Ok(export)
    }

    fn build_export(
        &self,
        source: AudioSource,
        text: String,
        meeting_id: Option<String>,
    ) -> TranscriptExport {
        let (speaker, stream) = match source {
            AudioSource::Both => ("Both".to_string(), "both".to_string()),
            s => {
                let labels = s.labels();
                (labels.speaker.to_string(), labels.stream.to_string())
            }
        };
        let word_count = text.split_whitespace().count();
        TranscriptExport {
            text,
            word_count,
            speaker,
            stream,
            source: source.as_str().to_string(),
            meeting_id,
        }
    }
}

/// Opens a single audio capture, creates an ASR pipeline, and spawns a worker thread.
///
/// `source` must be `Mic` or `SystemAudio` — never `Both`.
fn spawn_stream_worker(
    source: AudioSource,
    models: &LoadedEngine,
    stop_flag: Arc<AtomicBool>,
    segment_counter: Arc<AtomicU64>,
    transcript: TranscriptStore,
    app_handle: Option<AppHandle>,
    debug_session: Option<Arc<DebugSession>>,
    meetings: Option<MeetingStore>,
    meeting_id: Option<String>,
) -> Result<StreamPair, AppError> {
    super::cpal_capture::reset_capture_stats();
    let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(AUDIO_CHANNEL_BOUND);
    let opened =
        capture::open_capture(source, audio_tx).map_err(|e| AppError::Capture(format!("{e:#}")))?;
    let stream_name = source.as_str().to_string();
    let counters = opened.counters.clone();
    let observer = debug_session.as_ref().and_then(|session| {
        session.open_stream_observer(
            source.as_str(),
            opened.device_name.clone(),
            opened.sample_rate,
        )
    });
    let pipeline = models
        .create_pipeline(opened.sample_rate, source.as_str())
        .map_err(|e| AppError::Asr(format!("{e:#}")))?;
    let labels = source.labels();

    let worker_handle = std::thread::Builder::new()
        .name(format!("transcription-worker-{}", source.as_str()))
        .spawn(move || {
            let emit = |event: TranscriptEvent| {
                if let TranscriptEvent::Commit(c) = &event {
                    transcript.append_commit(&c.text);
                    if let (Some(store), Some(meeting_id)) = (&meetings, &meeting_id) {
                        // ASR recycles `seg-0` every session; PK is global so scope by meeting.
                        let row_id = format!("{meeting_id}:{}", c.segment_id);
                        if let Err(e) = store.insert_segment(
                            &row_id,
                            meeting_id,
                            c.start_ms as i64,
                            c.end_ms as i64,
                            &c.text,
                        ) {
                            tracing::error!(
                                error = %e,
                                segment_id = %c.segment_id,
                                "Failed to persist transcript segment"
                            );
                        }
                    }
                }
                if let Some(app) = &app_handle {
                    emit_to_app(app, event);
                }
            };
            worker::run_worker(
                audio_rx,
                pipeline,
                labels,
                emit,
                stop_flag,
                segment_counter,
                observer,
            );
        })
        .map_err(|e| AppError::Capture(format!("Failed to spawn worker: {e}")))?;

    Ok(StreamPair {
        worker_handle,
        _capture: opened,
        stream: stream_name,
        counters,
    })
}

fn emit_to_app(app_handle: &AppHandle, event: TranscriptEvent) {
    let result = match &event {
        TranscriptEvent::Partial(payload) => app_handle.emit(event_names::PARTIAL, payload),
        TranscriptEvent::Commit(payload) => app_handle.emit(event_names::COMMIT, payload),
        TranscriptEvent::Status(payload) => app_handle.emit(event_names::STATUS, payload),
        TranscriptEvent::MicLevel(payload) => app_handle.emit(event_names::MIC_LEVEL, payload),
        TranscriptEvent::Device(payload) => app_handle.emit(event_names::DEVICE, payload),
    };

    if let Err(e) = result {
        tracing::warn!(error = %e, "Failed to emit event");
    }
}
