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
const REQUIRED_MODEL_COMPONENTS: &[&str] = &[
    "MelSpectrogram.mlmodelc",
    "AudioEncoder.mlmodelc",
    "TextDecoder.mlmodelc",
];
const INIT_READY_TIMEOUT: Duration = Duration::from_secs(60);
const INIT_OVERALL_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ModelMetadata {
    pub model: String,
    #[serde(rename = "modelPath")]
    pub model_path: String,
    #[serde(rename = "cacheDir")]
    pub cache_dir: String,
    #[serde(rename = "downloadedAt")]
    pub downloaded_at: String,
    #[serde(rename = "tokenizerPath")]
    pub tokenizer_path: Option<String>,
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
    #[serde(rename = "loading")]
    Loading { stage: String },
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
        #[serde(rename = "tokenizerPath")]
        tokenizer_path: Option<String>,
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

        Self::wait_for_ready(&pipeline.responses)?;

        Ok(pipeline)
    }

    fn wait_for_ready(responses: &Receiver<anyhow::Result<HelperResponse>>) -> anyhow::Result<()> {
        let started = std::time::Instant::now();

        loop {
            if started.elapsed() >= INIT_OVERALL_TIMEOUT {
                anyhow::bail!(
                    "Timed out waiting for WhisperKit helper to become ready after {}s",
                    INIT_OVERALL_TIMEOUT.as_secs()
                );
            }

            match responses.recv_timeout(INIT_READY_TIMEOUT) {
                Ok(Ok(HelperResponse::Ready { model })) => {
                    anyhow::ensure!(
                        model == MODEL_NAME,
                        "Helper started with unexpected model {model}"
                    );
                    return Ok(());
                }
                Ok(Ok(HelperResponse::Loading { stage })) => {
                    tracing::info!(stage = %stage, "WhisperKit helper loading");
                }
                Ok(Ok(HelperResponse::Error { message })) => {
                    anyhow::bail!("WhisperKit helper failed during init: {message}");
                }
                Ok(Ok(other)) => {
                    anyhow::bail!("Unexpected helper response during init: {other:?}");
                }
                Ok(Err(err)) => return Err(err),
                Err(_) => {
                    tracing::debug!("Still waiting for WhisperKit helper ready...");
                }
            }
        }
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
                HelperResponse::Ready { .. }
                | HelperResponse::Downloaded { .. }
                | HelperResponse::Loading { .. } => {}
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
                Ok(Ok(
                    HelperResponse::Ready { .. }
                    | HelperResponse::Downloaded { .. }
                    | HelperResponse::Loading { .. }
                )) => {}
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

    for component in REQUIRED_MODEL_COMPONENTS {
        let component_path = model_path.join(component);
        if !component_path.exists() {
            return Err(format!(
                "WhisperKit model component {} is missing at {}. Re-run tauri-app/scripts/setup-whisperkit.sh.",
                component,
                component_path.display()
            ));
        }
    }

    if let Some(tokenizer_path) = metadata.tokenizer_path.as_ref() {
        if !PathBuf::from(tokenizer_path).exists() {
            return Err(format!(
                "WhisperKit tokenizer not found at {}. Re-run tauri-app/scripts/setup-whisperkit.sh.",
                tokenizer_path
            ));
        }
    } else if find_tokenizer_json(cache_dir).is_none() {
        return Err(format!(
            "WhisperKit tokenizer is not cached under {}. Re-run tauri-app/scripts/setup-whisperkit.sh.",
            cache_dir.display()
        ));
    }

    Ok(metadata)
}

fn find_tokenizer_json(cache_dir: &Path) -> Option<PathBuf> {
    let mut matches = Vec::new();
    collect_tokenizer_json(cache_dir, &mut matches);
    if let Some(path) = matches
        .iter()
        .find(|path| path.to_string_lossy().contains("whisper-large-v3"))
    {
        return Some(path.clone());
    }
    matches.into_iter().next()
}

fn collect_tokenizer_json(dir: &Path, matches: &mut Vec<PathBuf>) {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_tokenizer_json(&path, matches);
        } else if path.file_name().and_then(|name| name.to_str()) == Some("tokenizer.json") {
            matches.push(path);
        }
    }
}

pub fn cache_is_complete(helper_path: &Path, cache_dir: &Path) -> Result<(), String> {
    validate_installation(helper_path, cache_dir).map(|_| ())
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
