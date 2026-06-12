use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::ipc::transcript::*;
use crate::transcription::asr::LoadedModels;
use crate::transcription::audio_source::AudioSource;
use crate::transcription::capture;
use crate::transcription::transcript_store::TranscriptStore;
use crate::transcription::worker;

const AUDIO_CHANNEL_BOUND: usize = 64;

struct RunningState {
    stop_flag: Arc<AtomicBool>,
    worker_handle: JoinHandle<()>,
    _capture: capture::OpenedCapture,
    source: AudioSource,
    labels: crate::transcription::audio_source::StreamLabels,
}

pub struct TranscriptionService {
    running: Mutex<Option<RunningState>>,
    models: Mutex<Option<LoadedModels>>,
    segment_counter: Arc<AtomicU64>,
    transcript: TranscriptStore,
    last_export: Mutex<Option<TranscriptExport>>,
}

impl TranscriptionService {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(None),
            models: Mutex::new(None),
            segment_counter: Arc::new(AtomicU64::new(0)),
            transcript: TranscriptStore::new(),
            last_export: Mutex::new(None),
        }
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.running.lock().unwrap().is_some()
    }

    pub fn start(&self, app_handle: AppHandle, source: AudioSource) -> Result<(), AppError> {
        self.start_internal(Some(app_handle), source)
    }

    /// Start without a Tauri app handle (golden tests / headless runs).
    pub fn start_headless(&self, source: AudioSource) -> Result<(), AppError> {
        self.start_internal(None, source)
    }

    fn start_internal(
        &self,
        app_handle: Option<AppHandle>,
        source: AudioSource,
    ) -> Result<(), AppError> {
        let mut running = self.running.lock().unwrap();
        if running.is_some() {
            return Err(AppError::AlreadyRunning);
        }

        tracing::info!(?source, "Starting transcription");
        self.transcript.clear();
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

        let mut models_guard = self.models.lock().unwrap();
        if models_guard.is_none() {
            config.validate().map_err(|e| AppError::ModelLoad(e))?;

            match LoadedModels::load(&config) {
                Ok(loaded) => {
                    *models_guard = Some(loaded);
                }
                Err(e) => {
                    let msg = format!("{e:#}");
                    tracing::error!(error = %msg, "Model loading failed");
                    if let Some(app) = &app_handle {
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
        }

        let models = models_guard.as_ref().unwrap();
        let model_name = models.model_name.clone();

        let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(AUDIO_CHANNEL_BOUND);
        let opened = capture::open_capture(source, audio_tx)
            .map_err(|e| AppError::Capture(format!("{e:#}")))?;

        let pipeline = models
            .create_pipeline(&config.language, opened.sample_rate)
            .map_err(|e| AppError::Asr(format!("{e:#}")))?;

        let stream_labels = source.labels();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = stop_flag.clone();
        let counter = self.segment_counter.clone();
        let transcript = self.transcript.clone();
        let emit_app = app_handle.clone();

        let worker_handle = std::thread::Builder::new()
            .name("transcription-worker".into())
            .spawn(move || {
                let emit = |event: TranscriptEvent| {
                    if let TranscriptEvent::Commit(c) = &event {
                        transcript.append_commit(&c.text);
                    }
                    if let Some(app) = &emit_app {
                        emit_to_app(app, event);
                    }
                };
                worker::run_worker(
                    audio_rx,
                    pipeline,
                    stream_labels,
                    emit,
                    stop_clone,
                    counter,
                );
            })
            .map_err(|e| AppError::Capture(format!("Failed to spawn worker: {e}")))?;

        *running = Some(RunningState {
            stop_flag,
            worker_handle,
            _capture: opened,
            source,
            labels: stream_labels,
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
        }

        tracing::info!("Transcription started");
        Ok(())
    }

    pub fn stop(&self, app_handle: Option<&AppHandle>) -> Result<TranscriptExport, AppError> {
        let mut running = self.running.lock().unwrap();
        let state = match running.take() {
            Some(s) => s,
            None => {
                return Ok(self
                    .last_export
                    .lock()
                    .unwrap()
                    .clone()
                    .unwrap_or_else(|| self.build_export(AudioSource::Mic, self.transcript.text())));
            }
        };

        tracing::info!("Stopping transcription");

        state.stop_flag.store(true, Ordering::Relaxed);
        drop(state._capture);

        if let Err(e) = state.worker_handle.join() {
            tracing::error!("Worker thread panicked: {e:?}");
        }

        let export = self.build_export(state.source, self.transcript.text());
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
            .unwrap_or_else(|| self.build_export(AudioSource::Mic, self.transcript.text()));

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| AppError::Capture(format!("Failed to create export dir: {e}")))?;
        }
        fs::write(path, &export.text)
            .map_err(|e| AppError::Capture(format!("Failed to write transcript: {e}")))?;

        tracing::info!(path = %path.display(), words = export.word_count, "Transcript exported");
        Ok(export)
    }

    fn build_export(&self, source: AudioSource, text: String) -> TranscriptExport {
        let labels = source.labels();
        let word_count = text.split_whitespace().count();
        TranscriptExport {
            text,
            word_count,
            speaker: labels.speaker.to_string(),
            stream: labels.stream.to_string(),
            source: source.as_str().to_string(),
        }
    }
}

fn emit_to_app(app_handle: &AppHandle, event: TranscriptEvent) {
    let result = match &event {
        TranscriptEvent::Partial(payload) => app_handle.emit(event_names::PARTIAL, payload),
        TranscriptEvent::Commit(payload) => app_handle.emit(event_names::COMMIT, payload),
        TranscriptEvent::Status(payload) => app_handle.emit(event_names::STATUS, payload),
        TranscriptEvent::MicLevel(payload) => app_handle.emit(event_names::MIC_LEVEL, payload),
    };

    if let Err(e) = result {
        tracing::warn!(error = %e, "Failed to emit event");
    }
}
