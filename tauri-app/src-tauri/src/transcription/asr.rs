use std::time::Instant;

use crate::config::AppConfig;
use crate::transcription::nemotron::{self, NemotronPipeline};
use crate::transcription::pipeline::StreamingPipeline;

/// Loaded ASR engine for the process lifetime.
pub struct LoadedEngine {
    pub model_name: String,
    helper_path: std::path::PathBuf,
    model_bundle_dir: std::path::PathBuf,
}

impl LoadedEngine {
    pub fn load(config: &AppConfig) -> anyhow::Result<Self> {
        let start = Instant::now();
        config
            .validate()
            .map_err(|e| anyhow::anyhow!("Nemotron validation failed: {e}"))?;

        let engine = Self {
            model_name: nemotron::MODEL_DISPLAY_NAME.to_string(),
            helper_path: config.helper_path.clone(),
            model_bundle_dir: config.model_bundle_dir.clone(),
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
        input_sample_rate: u32,
        stream: &str,
    ) -> anyhow::Result<StreamingPipeline> {
        let pipeline = NemotronPipeline::start(
            &self.helper_path,
            &self.model_bundle_dir,
            input_sample_rate,
            stream,
        )?;

        tracing::info!(
            input_sample_rate,
            model = %self.model_name,
            stream,
            "Nemotron pipeline created"
        );

        Ok(StreamingPipeline::new(pipeline))
    }
}
