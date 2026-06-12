use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;

use tauri::{AppHandle, Emitter};

use crate::config::AppConfig;
use crate::error::AppError;
use crate::ipc::transcript::*;
use crate::transcription::asr::LoadedModels;
use crate::transcription::mic_input::{self, MicConfig};
use crate::transcription::worker;

const AUDIO_CHANNEL_BOUND: usize = 64;

/// Wrapper to make `cpal::Stream` Send-safe. The stream is only created/dropped
/// from the service's start/stop methods behind a Mutex, so this is safe.
/// The inner field is read (kept alive) until dropped in `stop()`.
struct SendStream(#[allow(dead_code)] cpal::Stream);
unsafe impl Send for SendStream {}

struct RunningState {
    stop_flag: Arc<AtomicBool>,
    worker_handle: JoinHandle<()>,
    _stream: SendStream,
}

pub struct TranscriptionService {
    running: Mutex<Option<RunningState>>,
    models: Mutex<Option<LoadedModels>>,
    segment_counter: Arc<AtomicU64>,
}

impl TranscriptionService {
    pub fn new() -> Self {
        Self {
            running: Mutex::new(None),
            models: Mutex::new(None),
            segment_counter: Arc::new(AtomicU64::new(0)),
        }
    }

    #[allow(dead_code)]
    pub fn is_active(&self) -> bool {
        self.running.lock().unwrap().is_some()
    }

    pub fn start(&self, app_handle: AppHandle) -> Result<(), AppError> {
        let mut running = self.running.lock().unwrap();
        if running.is_some() {
            return Err(AppError::AlreadyRunning);
        }

        tracing::info!("Starting transcription");

        let config = AppConfig::load();

        // Emit loading status
        let _ = app_handle.emit(
            event_names::STATUS,
            TranscriptionStatus {
                active: false,
                loading: Some(true),
                model: None,
                error: None,
            },
        );

        // Load models on first use, reuse thereafter
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
                    let _ = app_handle.emit(
                        event_names::STATUS,
                        TranscriptionStatus {
                            active: false,
                            loading: None,
                            model: None,
                            error: Some(msg.clone()),
                        },
                    );
                    return Err(AppError::ModelLoad(msg));
                }
            }
        }

        let models = models_guard.as_ref().unwrap();
        let model_name = models.model_name.clone();

        // Create ASR pipeline
        let pipeline = models
            .create_pipeline(&config)
            .map_err(|e| AppError::Asr(format!("{e:#}")))?;

        // Open mic
        let mic_config = MicConfig {
            sample_rate: config.sample_rate as u32,
            channels: config.channels,
        };
        let (audio_tx, audio_rx) = mpsc::sync_channel::<Vec<f32>>(AUDIO_CHANNEL_BOUND);
        let stream = mic_input::open_mic_stream(&mic_config, audio_tx)
            .map_err(|e| AppError::Capture(format!("{e:#}")))?;

        // Spawn worker
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = stop_flag.clone();
        let counter = self.segment_counter.clone();
        let app_clone = app_handle.clone();

        let worker_handle = std::thread::Builder::new()
            .name("transcription-worker".into())
            .spawn(move || {
                let emit = move |event: TranscriptEvent| {
                    emit_to_app(&app_clone, event);
                };
                worker::run_worker(audio_rx, pipeline, emit, stop_clone, counter);
            })
            .map_err(|e| AppError::Capture(format!("Failed to spawn worker: {e}")))?;

        *running = Some(RunningState {
            stop_flag,
            worker_handle,
            _stream: SendStream(stream),
        });

        // Drop models lock before emitting
        drop(models_guard);

        let _ = app_handle.emit(
            event_names::STATUS,
            TranscriptionStatus {
                active: true,
                loading: None,
                model: Some(model_name),
                error: None,
            },
        );

        tracing::info!("Transcription started");
        Ok(())
    }

    pub fn stop(&self, app_handle: &AppHandle) -> Result<(), AppError> {
        let mut running = self.running.lock().unwrap();
        let state = match running.take() {
            Some(s) => s,
            None => return Ok(()), // stop when idle is a no-op
        };

        tracing::info!("Stopping transcription");

        // 1. Signal the worker to stop
        state.stop_flag.store(true, Ordering::Relaxed);

        // 2. Drop the cpal stream (stops audio callbacks, closes sender side)
        drop(state._stream);

        // 3. Wait for worker to drain and exit
        if let Err(e) = state.worker_handle.join() {
            tracing::error!("Worker thread panicked: {e:?}");
        }

        // 4. Emit stopped status
        let _ = app_handle.emit(
            event_names::STATUS,
            TranscriptionStatus {
                active: false,
                loading: None,
                model: None,
                error: None,
            },
        );

        tracing::info!("Transcription stopped");
        Ok(())
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
