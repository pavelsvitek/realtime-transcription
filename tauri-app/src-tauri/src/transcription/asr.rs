use std::time::Instant;

use yamabiko_whisper::{AsrPipeline, AudioInputConfig, OnlineAsrModel, VadModel};

use crate::config::AppConfig;

/// Loaded ASR models (Whisper + Silero VAD), kept in memory for the process lifetime.
pub struct LoadedModels {
    pub whisper_model: OnlineAsrModel,
    pub vad_model: VadModel,
    pub model_name: String,
}

impl LoadedModels {
    pub fn load(config: &AppConfig) -> anyhow::Result<Self> {
        let start = Instant::now();

        tracing::info!(
            whisper_path = %config.whisper_model_path.display(),
            vad_path = %config.vad_model_path.display(),
            "Loading ASR models"
        );

        let whisper_model = OnlineAsrModel::load(&config.whisper_model_path)
            .map_err(|e| anyhow::anyhow!("Failed to load Whisper model: {e}"))?;

        let vad_model = VadModel::load(&config.vad_model_path)
            .map_err(|e| anyhow::anyhow!("Failed to load VAD model: {e}"))?;

        let model_name = config
            .whisper_model_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let elapsed = start.elapsed();
        tracing::info!(
            model = %model_name,
            elapsed_ms = elapsed.as_millis(),
            "ASR models loaded"
        );

        Ok(Self {
            whisper_model,
            vad_model,
            model_name,
        })
    }

    pub fn create_pipeline(&self, config: &AppConfig) -> anyhow::Result<AsrPipeline> {
        let processor = self
            .whisper_model
            .create_processor_with_vad(&config.language, &self.vad_model)
            .map_err(|e| anyhow::anyhow!("Failed to create ASR processor: {e}"))?;

        let audio_config = AudioInputConfig::new(config.sample_rate, config.channels as usize);
        let pipeline = AsrPipeline::new(processor, audio_config)
            .map_err(|e| anyhow::anyhow!("Failed to create ASR pipeline: {e}"))?;

        tracing::info!(
            sample_rate = config.sample_rate,
            channels = config.channels,
            language = %config.language,
            "ASR pipeline created"
        );

        Ok(pipeline)
    }
}
