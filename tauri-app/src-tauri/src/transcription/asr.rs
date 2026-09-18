use std::path::PathBuf;
use std::time::Instant;

use anyhow::Context;

use crate::config::AppConfig;
use crate::transcription::nemotron::{self, NemotronPipeline};
use crate::transcription::pipeline::StreamingPipeline;
use crate::transcription::xai::{self, XaiWsPipeline};
use crate::transcription::AsrBackend;

/// Loaded ASR engine for the process lifetime.
pub struct LoadedEngine {
    pub backend: AsrBackend,
    pub model_name: String,
    helper_path: Option<PathBuf>,
    model_bundle_dir: Option<PathBuf>,
    api_key: Option<String>,
}

impl LoadedEngine {
    pub fn load(config: &AppConfig, backend: AsrBackend) -> anyhow::Result<Self> {
        match backend {
            AsrBackend::Local => {
                let start = Instant::now();
                config
                    .validate()
                    .map_err(|e| anyhow::anyhow!("Nemotron validation failed: {e}"))?;

                let engine = Self {
                    backend,
                    model_name: nemotron::MODEL_DISPLAY_NAME.to_string(),
                    helper_path: Some(config.helper_path.clone()),
                    model_bundle_dir: Some(config.model_bundle_dir.clone()),
                    api_key: None,
                };

                tracing::info!(
                    model = %engine.model_name,
                    elapsed_ms = start.elapsed().as_millis(),
                    "Local ASR engine loaded"
                );

                Ok(engine)
            }
            AsrBackend::Xai => {
                let api_key = xai::resolve_api_key()
                    .context("xAI API key not set. Add it in Settings or set XAI_API_KEY.")?;
                let engine = Self {
                    backend,
                    model_name: xai::MODEL_DISPLAY_NAME.to_string(),
                    helper_path: None,
                    model_bundle_dir: None,
                    api_key: Some(api_key),
                };
                tracing::info!(model = %engine.model_name, "xAI ASR engine ready");
                Ok(engine)
            }
        }
    }

    pub fn create_pipeline(
        &self,
        input_sample_rate: u32,
        stream: &str,
    ) -> anyhow::Result<StreamingPipeline> {
        match self.backend {
            AsrBackend::Local => {
                let helper_path = self
                    .helper_path
                    .as_ref()
                    .context("local helper path missing")?;
                let model_bundle_dir = self
                    .model_bundle_dir
                    .as_ref()
                    .context("local model bundle dir missing")?;
                let pipeline = NemotronPipeline::start(
                    helper_path,
                    model_bundle_dir,
                    input_sample_rate,
                    stream,
                )?;

                tracing::info!(
                    input_sample_rate,
                    model = %self.model_name,
                    stream,
                    "Nemotron pipeline created"
                );

                Ok(StreamingPipeline::new(Box::new(pipeline)))
            }
            AsrBackend::Xai => {
                let api_key = self.api_key.as_ref().context("xAI API key missing")?;
                let pipeline = XaiWsPipeline::start(
                    api_key,
                    "en",
                    input_sample_rate,
                    stream,
                    false,
                )?;

                tracing::info!(
                    input_sample_rate,
                    language = "en",
                    model = %self.model_name,
                    stream,
                    "xAI WebSocket pipeline created"
                );

                Ok(StreamingPipeline::new(Box::new(pipeline)))
            }
        }
    }
}
