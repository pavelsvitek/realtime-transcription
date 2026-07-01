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
use crate::transcription::cpal_capture::CaptureCounters;
use crate::transcription::debug_dump::{DebugSession, StreamCaptureStats};
use crate::transcription::flac_convert::convert_wav_to_flac_background;
use crate::transcription::transcript_store::TranscriptStore;
use crate::transcription::worker;
use crate::transcription::whisperkit;

// WhisperKit decoding can take a few seconds on longer rolling buffers; keep enough
// headroom that capture does not drop loopback frames while the worker catches up.
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
        self.start_internal(Some(app_handle), source, false)
    }

    /// Start without a Tauri app handle (golden tests / headless runs).
    pub fn start_headless(&self, source: AudioSource) -> Result<(), AppError> {
        self.start_internal(None, source, headless_disable_partials())
    }

    fn start_internal(
        &self,
        app_handle: Option<AppHandle>,
        source: AudioSource,
        disable_partials: bool,
    ) -> Result<(), AppError> {
        let mut running = self.running.lock().unwrap();
        if running.is_some() {
            return Err(AppError::AlreadyRunning);
        }

        tracing::info!(?source, model = %whisperkit::MODEL_NAME, "Starting transcription");
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

        self.ensure_models_loaded(&config, app_handle.as_ref())?;

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
                    &config.language,
                    stop_flag.clone(),
                    counter.clone(),
                    transcript.clone(),
                    app_handle.clone(),
                    false,
                    debug_session.clone(),
                )?;
                let system = spawn_stream_worker(
                    AudioSource::SystemAudio,
                    models,
                    &config.language,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    false,
                    debug_session.clone(),
                )?;
                (Some(mic), Some(system))
            }
            AudioSource::Mic => {
                let pair = spawn_stream_worker(
                    AudioSource::Mic,
                    models,
                    &config.language,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    disable_partials,
                    debug_session.clone(),
                )?;
                (Some(pair), None)
            }
            AudioSource::SystemAudio => {
                let pair = spawn_stream_worker(
                    AudioSource::SystemAudio,
                    models,
                    &config.language,
                    stop_flag.clone(),
                    counter,
                    transcript,
                    app_handle.clone(),
                    disable_partials,
                    debug_session.clone(),
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

    fn ensure_models_loaded(
        &self,
        config: &AppConfig,
        app_handle: Option<&AppHandle>,
    ) -> Result<(), AppError> {
        let mut models_guard = self.models.lock().unwrap();
        if models_guard.is_some() {
            return Ok(());
        }

        config.validate().map_err(AppError::ModelLoad)?;

        match LoadedModels::load(config) {
            Ok(loaded) => {
                *models_guard = Some(loaded);
            }
            Err(e) => {
                let msg = format!("{e:#}");
                tracing::error!(error = %msg, "Model loading failed");
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

        // Drop captures first to close audio channels, then join workers.
        // Both captures must be closed before either join so workers can drain and exit.
        let pairs: Vec<StreamPair> = [state.mic, state.system].into_iter().flatten().collect();
        let capture_info: Vec<(String, CaptureCounters)> = pairs
            .iter()
            .map(|pair| (pair.stream.clone(), pair.counters.clone()))
            .collect();
        let handles: Vec<JoinHandle<()>> = pairs
            .into_iter()
            .map(|StreamPair {
                worker_handle,
                _capture,
                ..
            }| {
                drop(_capture);
                worker_handle
            })
            .collect();

        for handle in handles {
            if let Err(e) = handle.join() {
                tracing::error!("Worker thread panicked: {e:?}");
            }
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
        }
    }
}

/// Opens a single audio capture, creates an ASR pipeline, and spawns a worker thread.
///
/// `source` must be `Mic` or `SystemAudio` — never `Both`.
fn spawn_stream_worker(
    source: AudioSource,
    models: &LoadedModels,
    language: &str,
    stop_flag: Arc<AtomicBool>,
    segment_counter: Arc<AtomicU64>,
    transcript: TranscriptStore,
    app_handle: Option<AppHandle>,
    disable_partials: bool,
    debug_session: Option<Arc<DebugSession>>,
) -> Result<StreamPair, AppError> {
    super::cpal_capture::reset_capture_stats();
    let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(AUDIO_CHANNEL_BOUND);
    let opened = capture::open_capture(source, audio_tx)
        .map_err(|e| AppError::Capture(format!("{e:#}")))?;
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
        .create_pipeline(language, opened.sample_rate, source.as_str(), disable_partials)
        .map_err(|e| AppError::Asr(format!("{e:#}")))?;
    let labels = source.labels();

    let worker_handle = std::thread::Builder::new()
        .name(format!("transcription-worker-{}", source.as_str()))
        .spawn(move || {
            let emit = |event: TranscriptEvent| {
                if let TranscriptEvent::Commit(c) = &event {
                    transcript.append_commit(&c.text);
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

fn headless_disable_partials() -> bool {
    std::env::var("WHISPERKIT_DISABLE_PARTIALS")
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}
