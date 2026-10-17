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

use super::pipeline::{AsrOutput, AsrWord, StreamingAsr};

pub const MODEL_DISPLAY_NAME: &str = "Nemotron 3.5 ASR Streaming 0.6B CoreML INT8";
pub const CACHE_SUBDIR: &str = "nemotron";
pub const MODEL_REPOSITORY: &str = "aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8";
pub const MODEL_BUNDLE_SUBDIR: &str =
    "qwen3-speech/models/aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8";
/// Approximate CoreML INT8 artifact size (see MODEL_INVESTIGATION.md).
pub const EXPECTED_DOWNLOAD_SIZE_BYTES: u64 = 612 * 1024 * 1024;
const REQUIRED_MODEL_COMPONENTS: &[&str] = &[
    "encoder.mlmodelc",
    "decoder.mlmodelc",
    "joint.mlmodelc",
    "config.json",
    "vocab.json",
    "languages.json",
];
const INIT_READY_TIMEOUT: Duration = Duration::from_secs(60);
const INIT_OVERALL_TIMEOUT: Duration = Duration::from_secs(300);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(60 * 30);

#[derive(Serialize)]
struct InitRequest<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    #[serde(rename = "bundleDir")]
    bundle_dir: &'a str,
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
    #[serde(rename = "boundary-done")]
    BoundaryDone,
    #[allow(dead_code)]
    #[serde(rename = "downloaded")]
    Downloaded {
        model: String,
        #[serde(rename = "modelPath")]
        model_path: String,
    },
}

pub struct NemotronPipeline {
    child: Child,
    stdin: ChildStdin,
    responses: Receiver<anyhow::Result<HelperResponse>>,
}

impl NemotronPipeline {
    pub fn start(
        helper_path: &Path,
        model_bundle_dir: &Path,
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
                    Ok(raw) if raw.trim().is_empty() => continue,
                    Ok(raw) => serde_json::from_str::<HelperResponse>(&raw).map_err(|error| {
                        anyhow::anyhow!("Invalid helper JSON: {error}; line={raw}")
                    }),
                    Err(error) => Err(anyhow::anyhow!("Failed to read helper stdout: {error}")),
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
            bundle_dir: model_bundle_dir.to_string_lossy().as_ref(),
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
                    "Timed out waiting for Nemotron helper after {}s",
                    INIT_OVERALL_TIMEOUT.as_secs()
                );
            }

            match responses.recv_timeout(INIT_READY_TIMEOUT) {
                Ok(Ok(HelperResponse::Ready { model })) => {
                    anyhow::ensure!(
                        model == MODEL_DISPLAY_NAME,
                        "Helper started with unexpected model {model}"
                    );
                    return Ok(());
                }
                Ok(Ok(HelperResponse::Loading { stage })) => {
                    tracing::info!(stage = %stage, "Nemotron helper loading");
                }
                Ok(Ok(HelperResponse::Error { message })) => {
                    anyhow::bail!("Nemotron helper failed during init: {message}");
                }
                Ok(Ok(other)) => anyhow::bail!("Unexpected helper response during init: {other:?}"),
                Ok(Err(error)) => return Err(error),
                Err(_) => tracing::debug!("Still waiting for Nemotron helper..."),
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

    pub fn cut_utterance(&mut self) -> anyhow::Result<Option<AsrOutput>> {
        self.send(&BasicRequest { kind: "boundary" })?;
        self.collect_until_boundary()
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
                } => {
                    output.tentative.clear();
                    output.committed.push(asr_segment(text, start_ms, end_ms));
                }
                HelperResponse::Partial {
                    text,
                    start_ms,
                    end_ms,
                } => {
                    output.tentative.clear();
                    output.tentative.push(asr_segment(text, start_ms, end_ms));
                }
                HelperResponse::Error { message } => anyhow::bail!(message),
                HelperResponse::Finished | HelperResponse::BoundaryDone => break,
                HelperResponse::Ready { .. }
                | HelperResponse::Loading { .. }
                | HelperResponse::Downloaded { .. } => {}
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
                })) => output.committed.push(asr_segment(text, start_ms, end_ms)),
                Ok(Ok(HelperResponse::Partial { .. })) => {}
                Ok(Ok(HelperResponse::Finished | HelperResponse::BoundaryDone)) => break,
                Ok(Ok(HelperResponse::Error { message })) => anyhow::bail!(message),
                Ok(Ok(
                    HelperResponse::Ready { .. }
                    | HelperResponse::Loading { .. }
                    | HelperResponse::Downloaded { .. },
                )) => {}
                Ok(Err(error)) => return Err(error),
                Err(_) => anyhow::bail!("Timed out waiting for Nemotron helper to finish"),
            }
        }
        Ok(output)
    }

    /// Wait until the helper finishes a speaker-change cut.
    ///
    /// A commit is optional: silence has nothing to emit, and `boundary-done`
    /// is what unblocks that case. The timeout is only a stuck-helper guard.
    fn collect_until_boundary(&mut self) -> anyhow::Result<Option<AsrOutput>> {
        let mut output = AsrOutput::default();
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                tracing::warn!("Timed out waiting for Nemotron speaker boundary");
                break;
            }
            match self.responses.recv_timeout(remaining) {
                Ok(Ok(message)) => match apply_boundary_response(message, &mut output)? {
                    BoundaryStep::KeepGoing => {}
                    BoundaryStep::Done => break,
                },
                Ok(Err(error)) => return Err(error),
                Err(mpsc::RecvTimeoutError::Timeout) => {
                    tracing::warn!("Timed out waiting for Nemotron speaker boundary");
                    break;
                }
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    anyhow::bail!("Nemotron helper closed during speaker boundary");
                }
            }
        }
        if output.is_empty() {
            Ok(None)
        } else {
            Ok(Some(output))
        }
    }
}

impl Drop for NemotronPipeline {
    fn drop(&mut self) {
        let _ = self.send(&BasicRequest { kind: "shutdown" });
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl StreamingAsr for NemotronPipeline {
    fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
        NemotronPipeline::push_mono(self, samples)
    }

    fn finish(&mut self) -> anyhow::Result<AsrOutput> {
        NemotronPipeline::finish(self)
    }

    fn cut_utterance(&mut self) -> anyhow::Result<Option<AsrOutput>> {
        NemotronPipeline::cut_utterance(self)
    }
}

pub fn validate_installation(helper_path: &Path, model_bundle_dir: &Path) -> Result<(), String> {
    if !helper_path.exists() {
        return Err(format!(
            "Nemotron helper not found at {}. Run apps/amie/scripts/setup-nemotron.sh.",
            helper_path.display()
        ));
    }
    if !model_bundle_dir.is_dir() {
        return Err(format!(
            "Nemotron model bundle not found at {}. Run apps/amie/scripts/setup-nemotron.sh.",
            model_bundle_dir.display()
        ));
    }

    for component in REQUIRED_MODEL_COMPONENTS {
        let path = model_bundle_dir.join(component);
        if !path.exists() {
            return Err(format!(
                "Nemotron model component {} is missing at {}. Run apps/amie/scripts/setup-nemotron.sh.",
                component,
                path.display()
            ));
        }
    }
    Ok(())
}

pub fn model_bundle_ready(model_bundle_dir: &Path) -> bool {
    if !model_bundle_dir.is_dir() {
        return false;
    }
    REQUIRED_MODEL_COMPONENTS
        .iter()
        .all(|component| model_bundle_dir.join(component).exists())
}

/// Runs `nemotron-bridge --download-only --cache-dir <cache_root>` (same path as setup-nemotron.sh).
pub fn download_model(helper_path: &Path, cache_root: &Path) -> Result<(), String> {
    if !helper_path.exists() {
        return Err(format!(
            "Nemotron helper not found at {}. Run apps/amie/scripts/setup-nemotron.sh.",
            helper_path.display()
        ));
    }

    let bundle_dir = default_model_bundle_dir(cache_root);
    if model_bundle_ready(&bundle_dir) {
        return Ok(());
    }

    std::fs::create_dir_all(cache_root).map_err(|error| {
        format!(
            "Failed to create model cache at {}: {error}",
            cache_root.display()
        )
    })?;

    let cache_dir = cache_root.to_string_lossy().into_owned();
    tracing::info!(
        helper = %helper_path.display(),
        cache = %cache_dir,
        "Starting speech model download"
    );

    let mut child = Command::new(helper_path)
        .args(["--download-only", "--cache-dir", &cache_dir])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start model download: {error}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    if let Some(stdout) = stdout {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if !line.trim().is_empty() {
                    tracing::info!(target: "nemotron-download", "{line}");
                }
            }
        });
    }
    if let Some(stderr) = stderr {
        spawn_stderr_logger(stderr);
    }

    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => {
                if model_bundle_ready(&bundle_dir) {
                    return Ok(());
                }
                return Err(format!(
                    "Model download finished but bundle is incomplete at {}",
                    bundle_dir.display()
                ));
            }
            Ok(Some(status)) => {
                return Err(format!(
                    "Model download exited with {status} (helper {})",
                    helper_path.display()
                ));
            }
            Ok(None) if started.elapsed() >= DOWNLOAD_TIMEOUT => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "Model download timed out after {}s",
                    DOWNLOAD_TIMEOUT.as_secs()
                ));
            }
            Ok(None) => thread::sleep(Duration::from_millis(250)),
            Err(error) => {
                return Err(format!("Failed while waiting for model download: {error}"));
            }
        }
    }
}

pub fn default_model_bundle_dir(cache_root: &Path) -> PathBuf {
    cache_root.join(MODEL_BUNDLE_SUBDIR)
}

fn spawn_stderr_logger(stderr: ChildStderr) {
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            match line {
                Ok(text) if !text.trim().is_empty() => {
                    tracing::info!(target: "nemotron-helper", "{text}")
                }
                Ok(_) => {}
                Err(error) => {
                    tracing::warn!(target: "nemotron-helper", %error, "Failed to read helper stderr");
                    return;
                }
            }
        }
    });
}

fn floats_to_pcm16(samples: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(samples.len() * 2);
    for &sample in samples {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

fn asr_segment(text: String, start_ms: u64, end_ms: u64) -> AsrWord {
    AsrWord {
        text,
        start: start_ms as f64 / 1_000.0,
        end: end_ms as f64 / 1_000.0,
    }
}

enum BoundaryStep {
    KeepGoing,
    Done,
}

/// Fold one helper message while waiting for a speaker-change cut.
fn apply_boundary_response(
    message: HelperResponse,
    output: &mut AsrOutput,
) -> anyhow::Result<BoundaryStep> {
    match message {
        HelperResponse::Commit {
            text,
            start_ms,
            end_ms,
        } => {
            output.committed.push(asr_segment(text, start_ms, end_ms));
            Ok(BoundaryStep::KeepGoing)
        }
        HelperResponse::Partial { .. }
        | HelperResponse::Ready { .. }
        | HelperResponse::Loading { .. }
        | HelperResponse::Downloaded { .. } => Ok(BoundaryStep::KeepGoing),
        HelperResponse::BoundaryDone | HelperResponse::Finished => Ok(BoundaryStep::Done),
        HelperResponse::Error { message } => anyhow::bail!(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_bundle_path_matches_speech_swift_cache_layout() {
        let path = default_model_bundle_dir(Path::new("/cache"));
        assert_eq!(
            path,
            Path::new(
                "/cache/qwen3-speech/models/aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8"
            )
        );
    }

    #[test]
    fn floats_to_pcm16_clamps_values() {
        let bytes = floats_to_pcm16(&[-2.0, 0.0, 2.0]);
        let values: Vec<i16> = bytes
            .chunks_exact(2)
            .map(|chunk| i16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        assert_eq!(values, vec![i16::MIN + 1, 0, i16::MAX]);
    }

    #[test]
    fn validation_reports_missing_helper() {
        let error = validate_installation(
            Path::new("/definitely/missing/helper"),
            Path::new("/definitely/missing/model"),
        )
        .unwrap_err();
        assert!(error.contains("setup-nemotron.sh"));
    }

    #[test]
    fn boundary_request_names_the_cut() {
        let value = serde_json::to_value(BasicRequest { kind: "boundary" }).unwrap();
        assert_eq!(value["type"], "boundary");
    }

    #[test]
    fn boundary_done_with_no_commit_finishes_empty() {
        let mut output = AsrOutput::default();
        let step = apply_boundary_response(HelperResponse::BoundaryDone, &mut output).unwrap();
        assert!(matches!(step, BoundaryStep::Done));
        assert!(output.is_empty());
    }

    #[test]
    fn boundary_commit_is_kept_until_done() {
        let mut output = AsrOutput::default();
        let step = apply_boundary_response(
            HelperResponse::Commit {
                text: "from ada".into(),
                start_ms: 0,
                end_ms: 1_000,
            },
            &mut output,
        )
        .unwrap();
        assert!(matches!(step, BoundaryStep::KeepGoing));
        assert_eq!(output.committed.len(), 1);
        let step = apply_boundary_response(HelperResponse::BoundaryDone, &mut output).unwrap();
        assert!(matches!(step, BoundaryStep::Done));
        assert_eq!(output.committed[0].text, "from ada");
    }
}
