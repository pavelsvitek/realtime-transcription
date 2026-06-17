use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStderr, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

use anyhow::Context;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use super::pipeline::{AsrOutput, AsrWord};

pub const MODEL_NAME: &str = "large-v3-v20240930_626MB";
pub const MODEL_DISPLAY_NAME: &str = "WhisperKit large-v3 (626MB)";
pub const CACHE_SUBDIR: &str = "whisperkit";
pub const METADATA_FILE: &str = "model-info.json";

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelMetadata {
    pub model: String,
    #[serde(rename = "modelPath")]
    pub model_path: String,
    #[serde(rename = "cacheDir")]
    pub cache_dir: String,
    #[serde(rename = "downloadedAt")]
    pub downloaded_at: String,
}

#[derive(Serialize)]
struct InitRequest<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    language: &'a str,
    model: &'a str,
    #[serde(rename = "cacheDir")]
    cache_dir: &'a str,
    #[serde(rename = "sampleRate")]
    sample_rate: u32,
    stream: &'a str,
}

#[derive(Serialize)]
struct AudioRequest<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "pcm16Base64")]
    pcm16_base64: &'a str,
}

#[derive(Serialize)]
struct BasicRequest {
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
enum HelperResponse {
    #[serde(rename = "ready")]
    Ready { model: String },
    #[serde(rename = "commit")]
    Commit {
        text: String,
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "endMs")]
        end_ms: u64,
    },
    #[serde(rename = "partial")]
    Partial {
        text: String,
        #[serde(rename = "startMs")]
        start_ms: u64,
        #[serde(rename = "endMs")]
        end_ms: u64,
    },
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "finished")]
    Finished,
    #[allow(dead_code)]
    #[serde(rename = "downloaded")]
    Downloaded {
        model: String,
        #[serde(rename = "modelPath")]
        model_path: String,
        #[serde(rename = "cacheDir")]
        cache_dir: String,
    },
}

pub struct WhisperkitPipeline {
    child: Child,
    stdin: ChildStdin,
    responses: Receiver<anyhow::Result<HelperResponse>>,
}

impl WhisperkitPipeline {
    pub fn start(
        helper_path: &Path,
        cache_dir: &Path,
        language: &str,
        input_sample_rate: u32,
        stream: &str,
    ) -> anyhow::Result<Self> {
        let mut child = Command::new(helper_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .with_context(|| format!("Failed to spawn {}", helper_path.display()))?;

        let stdin = child.stdin.take().context("helper stdin unavailable")?;
        let stdout = child.stdout.take().context("helper stdout unavailable")?;
        let stderr = child.stderr.take().context("helper stderr unavailable")?;

        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                let result = match line {
                    Ok(raw) => serde_json::from_str::<HelperResponse>(&raw)
                        .map_err(|e| anyhow::anyhow!("Invalid helper JSON: {e}; line={raw}")),
                    Err(e) => Err(anyhow::anyhow!("Failed to read helper stdout: {e}")),
                };

                if tx.send(result).is_err() {
                    return;
                }
            }
        });

        spawn_stderr_logger(stderr);

        let mut pipeline = Self {
            child,
            stdin,
            responses: rx,
        };

        pipeline.send(&InitRequest {
            kind: "init",
            language,
            model: MODEL_NAME,
            cache_dir: cache_dir.to_string_lossy().as_ref(),
            sample_rate: input_sample_rate,
            stream,
        })?;

        match pipeline.responses.recv_timeout(Duration::from_secs(120)) {
            Ok(Ok(HelperResponse::Ready { model })) => {
                anyhow::ensure!(
                    model == MODEL_NAME,
                    "Helper started with unexpected model {model}"
                );
            }
            Ok(Ok(HelperResponse::Error { message })) => {
                anyhow::bail!("WhisperKit helper failed during init: {message}");
            }
            Ok(Ok(other)) => {
                anyhow::bail!("Unexpected helper response during init: {other:?}");
            }
            Ok(Err(err)) => return Err(err),
            Err(_) => anyhow::bail!("Timed out waiting for WhisperKit helper to become ready"),
        }

        Ok(pipeline)
    }

    pub fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
        let pcm16 = floats_to_pcm16(samples);
        let encoded = BASE64_STANDARD.encode(pcm16);
        self.send(&AudioRequest {
            kind: "audio",
            pcm16_base64: &encoded,
        })?;
        self.collect_available_output()
    }

    pub fn finish(&mut self) -> anyhow::Result<AsrOutput> {
        self.send(&BasicRequest { kind: "finish" })?;
        self.collect_until_finished()
    }

    fn send<T: Serialize>(&mut self, payload: &T) -> anyhow::Result<()> {
        let raw = serde_json::to_vec(payload)?;
        self.stdin.write_all(&raw)?;
        self.stdin.write_all(b"\n")?;
        self.stdin.flush()?;
        Ok(())
    }

    fn collect_available_output(&mut self) -> anyhow::Result<Option<AsrOutput>> {
        let mut output = AsrOutput::default();

        while let Ok(message) = self.responses.try_recv() {
            match message? {
                HelperResponse::Commit {
                    text,
                    start_ms,
                    end_ms,
                } => output.committed.push(asr_word(text, start_ms, end_ms)),
                HelperResponse::Partial {
                    text,
                    start_ms,
                    end_ms,
                } => {
                    output.tentative.clear();
                    output.tentative.push(asr_word(text, start_ms, end_ms));
                }
                HelperResponse::Error { message } => anyhow::bail!(message),
                HelperResponse::Finished => break,
                HelperResponse::Ready { .. } | HelperResponse::Downloaded { .. } => {}
            }
        }

        if output.is_empty() {
            Ok(None)
        } else {
            Ok(Some(output))
        }
    }

    fn collect_until_finished(&mut self) -> anyhow::Result<AsrOutput> {
        let mut output = AsrOutput::default();

        loop {
            match self.responses.recv_timeout(Duration::from_secs(120)) {
                Ok(Ok(HelperResponse::Commit {
                    text,
                    start_ms,
                    end_ms,
                })) => output.committed.push(asr_word(text, start_ms, end_ms)),
                Ok(Ok(HelperResponse::Partial {
                    text,
                    start_ms,
                    end_ms,
                })) => {
                    output.tentative.clear();
                    output.tentative.push(asr_word(text, start_ms, end_ms));
                }
                Ok(Ok(HelperResponse::Finished)) => break,
                Ok(Ok(HelperResponse::Error { message })) => anyhow::bail!(message),
                Ok(Ok(HelperResponse::Ready { .. } | HelperResponse::Downloaded { .. })) => {}
                Ok(Err(err)) => return Err(err),
                Err(_) => anyhow::bail!("Timed out waiting for WhisperKit helper to finish"),
            }
        }

        Ok(output)
    }
}

impl Drop for WhisperkitPipeline {
    fn drop(&mut self) {
        let _ = self.send(&BasicRequest { kind: "shutdown" });
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub fn validate_installation(helper_path: &Path, cache_dir: &Path) -> Result<ModelMetadata, String> {
    if !helper_path.exists() {
        return Err(format!(
            "WhisperKit helper not found at {}. Run tauri-app/scripts/setup-whisperkit.sh.",
            helper_path.display()
        ));
    }

    fs::create_dir_all(cache_dir).map_err(|e| {
        format!(
            "Failed to create WhisperKit cache directory {}: {e}",
            cache_dir.display()
        )
    })?;

    let metadata_path = cache_dir.join(METADATA_FILE);
    let raw = fs::read_to_string(&metadata_path).map_err(|_| {
        format!(
            "WhisperKit model metadata not found at {}. Run tauri-app/scripts/setup-whisperkit.sh.",
            metadata_path.display()
        )
    })?;

    let metadata: ModelMetadata = serde_json::from_str(&raw).map_err(|e| {
        format!(
            "WhisperKit model metadata at {} is invalid: {e}",
            metadata_path.display()
        )
    })?;

    if metadata.model != MODEL_NAME {
        return Err(format!(
            "WhisperKit metadata references model {} but expected {}. Re-run tauri-app/scripts/setup-whisperkit.sh.",
            metadata.model, MODEL_NAME
        ));
    }

    let model_path = PathBuf::from(&metadata.model_path);
    if !model_path.exists() {
        return Err(format!(
            "WhisperKit model path {} does not exist. Re-run tauri-app/scripts/setup-whisperkit.sh.",
            model_path.display()
        ));
    }

    Ok(metadata)
}

fn spawn_stderr_logger(stderr: ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) if !text.trim().is_empty() => tracing::info!(target: "whisperkit-helper", "{text}"),
                Ok(_) => {}
                Err(err) => {
                    tracing::warn!(target: "whisperkit-helper", error = %err, "Failed to read helper stderr");
                    return;
                }
            }
        }
    });
}

fn floats_to_pcm16(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let int_sample = (clamped * i16::MAX as f32).round() as i16;
        bytes.extend_from_slice(&int_sample.to_le_bytes());
    }
    bytes
}

fn asr_word(text: String, start_ms: u64, end_ms: u64) -> AsrWord {
    AsrWord {
        text,
        start: start_ms as f64 / 1000.0,
        end: end_ms as f64 / 1000.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn floats_to_pcm16_clamps_and_scales() {
        let bytes = floats_to_pcm16(&[-2.0, -1.0, 0.0, 1.0, 2.0]);
        let samples: Vec<i16> = bytes
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        assert_eq!(samples[0], i16::MIN + 1);
        assert_eq!(samples[1], i16::MIN + 1);
        assert_eq!(samples[2], 0);
        assert_eq!(samples[3], i16::MAX);
        assert_eq!(samples[4], i16::MAX);
    }
}
