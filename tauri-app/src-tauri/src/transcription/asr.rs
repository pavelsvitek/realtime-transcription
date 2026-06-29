use std::time::Instant;

use crate::config::AppConfig;
use crate::transcription::pipeline::StreamingPipeline;
use crate::transcription::whisperkit::{self, WhisperkitPipeline};

/// Loaded ASR engine for the process lifetime.
pub struct LoadedEngine {
    pub model_name: String,
    helper_path: std::path::PathBuf,
    cache_dir: std::path::PathBuf,
}

/// Backwards-compatible alias used by golden tests.
pub type LoadedModels = LoadedEngine;

impl LoadedEngine {
    pub fn load(config: &AppConfig) -> anyhow::Result<Self> {
        let start = Instant::now();
        config
            .validate()
            .map_err(|e| anyhow::anyhow!("WhisperKit validation failed: {e}"))?;

        let engine = Self {
            model_name: whisperkit::MODEL_DISPLAY_NAME.to_string(),
            helper_path: config.helper_path.clone(),
            cache_dir: config.model_cache_dir.clone(),
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
        stream: &str,
        disable_partials: bool,
    ) -> anyhow::Result<StreamingPipeline> {
        let pipeline = WhisperkitPipeline::start(
            &self.helper_path,
            &self.cache_dir,
            language,
            input_sample_rate,
            stream,
            disable_partials,
        )?;

        tracing::info!(
            input_sample_rate,
            language = %language,
            model = %self.model_name,
            stream,
            "WhisperKit pipeline created"
        );

        Ok(StreamingPipeline::new(pipeline))
    }
}
