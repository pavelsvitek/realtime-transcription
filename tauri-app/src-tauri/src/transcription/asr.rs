use std::sync::Arc;
use std::time::Instant;

use yamabiko_whisper::{AudioInputConfig, OnlineAsrModel, VadModel};

use crate::config::AppConfig;
use crate::transcription::canary::{CanaryEngine, CanaryRuntime};
use crate::transcription::model::ModelId;
use crate::transcription::pipeline::StreamingPipeline;

struct WhisperModels {
    whisper_model: OnlineAsrModel,
    vad_model: VadModel,
}

/// Loaded ASR engine for a selected model, kept in memory for the process lifetime.
pub struct LoadedEngine {
    pub model_id: ModelId,
    pub model_name: String,
    whisper: Option<WhisperModels>,
    canary: Option<Arc<CanaryRuntime>>,
}

/// Backwards-compatible alias used by golden tests.
pub type LoadedModels = LoadedEngine;

impl LoadedEngine {
    pub fn load(config: &AppConfig) -> anyhow::Result<Self> {
        Self::load_model(config.model_id, config)
    }

    pub fn load_model(model_id: ModelId, config: &AppConfig) -> anyhow::Result<Self> {
        let start = Instant::now();

        let engine = match model_id {
            ModelId::WhisperSmallEn | ModelId::WhisperLargeV3Turbo => {
                let whisper_path = model_id
                    .whisper_model_path(&AppConfig::default_models_dir())
                    .expect("whisper model path");

                tracing::info!(
                    whisper_path = %whisper_path.display(),
                    vad_path = %config.vad_model_path.display(),
                    model = %model_id.as_str(),
                    "Loading Whisper ASR models"
                );

                let whisper_model = OnlineAsrModel::load(&whisper_path)
                    .map_err(|e| anyhow::anyhow!("Failed to load Whisper model: {e}"))?;
                let vad_model = VadModel::load(&config.vad_model_path)
                    .map_err(|e| anyhow::anyhow!("Failed to load VAD model: {e}"))?;

                Self {
                    model_id,
                    model_name: model_id.display_name().to_string(),
                    whisper: Some(WhisperModels {
                        whisper_model,
                        vad_model,
                    }),
                    canary: None,
                }
            }
            ModelId::CanaryQwenCoreML => {
                tracing::info!(model = %model_id.as_str(), "Loading Canary CoreML engine");
                let runtime = CanaryRuntime::load(None)?;
                Self {
                    model_id,
                    model_name: model_id.display_name().to_string(),
                    whisper: None,
                    canary: Some(runtime),
                }
            }
        };

        tracing::info!(
            model = %engine.model_name,
            elapsed_ms = start.elapsed().as_millis(),
            "ASR engine loaded"
        );

        Ok(engine)
    }

    pub fn create_pipeline(
        &self,
        language: &str,
        input_sample_rate: u32,
    ) -> anyhow::Result<StreamingPipeline> {
        if let Some(whisper) = &self.whisper {
            let processor = whisper
                .whisper_model
                .create_processor_with_vad(language, &whisper.vad_model)
                .map_err(|e| anyhow::anyhow!("Failed to create ASR processor: {e}"))?;

            let audio_config = AudioInputConfig::new(input_sample_rate, 1);
            let pipeline = yamabiko_whisper::AsrPipeline::new(processor, audio_config)
                .map_err(|e| anyhow::anyhow!("Failed to create ASR pipeline: {e}"))?;

            tracing::info!(
                input_sample_rate,
                language = %language,
                model = %self.model_name,
                "Whisper ASR pipeline created"
            );

            return Ok(StreamingPipeline::Whisper(pipeline));
        }

        if let Some(runtime) = &self.canary {
            let engine = CanaryEngine::from_runtime(runtime.clone())?;
            tracing::info!(
                input_sample_rate,
                model = %self.model_name,
                "Canary ASR pipeline created"
            );
            return Ok(StreamingPipeline::Canary(engine));
        }

        anyhow::bail!("No ASR backend loaded for {}", self.model_name)
    }
}
