use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use ndarray::Array2;
use tokenizers::Tokenizer;

use super::model::canary_models_dir;
use super::pipeline::{AsrOutput, AsrWord};

const CHUNK_SECONDS: f64 = 5.0;
const SAMPLE_RATE: u32 = 16_000;
const N_FFT: usize = 512;
const HOP_LENGTH: usize = 160;
const N_MELS: usize = 80;
const MAX_NEW_TOKENS: usize = 256;
const PROMPT: &str = "Transcribe the following: ";

#[cfg(target_vendor = "apple")]
use coreml_native::{
    compile_model, BorrowedTensor, ComputeUnits, Model, Prediction, State,
};

pub struct CanaryRuntime {
    #[cfg(target_vendor = "apple")]
    encoder: Model,
    #[cfg(target_vendor = "apple")]
    projection: Model,
    #[cfg(target_vendor = "apple")]
    decoder: Model,
    #[cfg(target_vendor = "apple")]
    lm_head: Model,
    tokenizer: Tokenizer,
    mel_filter: Array2<f32>,
    eos_token_id: u32,
    #[cfg(target_vendor = "apple")]
    decoder_prefill_inputs: Vec<String>,
    #[cfg(target_vendor = "apple")]
    decoder_decode_inputs: Vec<String>,
    #[cfg(target_vendor = "apple")]
    lm_head_input: String,
    #[cfg(target_vendor = "apple")]
    lm_head_output: String,
}

pub struct CanaryEngine {
    runtime: Arc<CanaryRuntime>,
    #[cfg(target_vendor = "apple")]
    dec_state: State,
    buffer: Vec<f32>,
    chunk_samples: usize,
    elapsed_seconds: f64,
}

impl CanaryRuntime {
    pub fn load(models_dir: Option<&Path>) -> anyhow::Result<Arc<Self>> {
        let dir = models_dir
            .map(PathBuf::from)
            .unwrap_or_else(canary_models_dir);

        let start = Instant::now();
        tracing::info!(path = %dir.display(), "Loading Canary CoreML engine");

        let mel_filter = load_mel_filter(&dir.join("canary_mel_window.bin"))?;
        let tokenizer = Tokenizer::from_file(dir.join("tokenizer.json"))
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {e}"))?;

        let eos_token_id = tokenizer
            .token_to_id("</s>")
            .or_else(|| tokenizer.token_to_id("<|endoftext|>"))
            .or_else(|| tokenizer.token_to_id(""))
            .unwrap_or(0);

        #[cfg(target_vendor = "apple")]
        {
            let encoder = load_coreml_model(&dir, "encoder_int8")?;
            let projection = load_coreml_model(&dir, "projection")?;
            let decoder = load_coreml_model(&dir, "canary_decoder_stateful_int8")?;
            let lm_head = load_coreml_model(&dir, "canary_lm_head_int8")?;

            log_model_io("encoder", &encoder);
            log_model_io("projection", &projection);
            log_model_io("decoder", &decoder);
            log_model_io("lm_head", &lm_head);

            let dec_state = decoder
                .new_state()
                .map_err(|e| anyhow::anyhow!("Failed to create decoder state: {e}"))?;
            let _ = dec_state;

            let decoder_inputs: Vec<String> =
                decoder.inputs().iter().map(|d| d.name().to_string()).collect();
            let lm_head_input = lm_head
                .inputs()
                .first()
                .map(|d| d.name().to_string())
                .unwrap_or_else(|| "hidden_states".into());
            let lm_head_output = lm_head
                .outputs()
                .first()
                .map(|d| d.name().to_string())
                .unwrap_or_else(|| "logits".into());

            tracing::info!(
                elapsed_ms = start.elapsed().as_millis(),
                "Canary CoreML engine loaded"
            );

            Ok(Arc::new(Self {
                encoder,
                projection,
                decoder,
                lm_head,
                tokenizer,
                mel_filter,
                eos_token_id,
                decoder_prefill_inputs: decoder_inputs.clone(),
                decoder_decode_inputs: decoder_inputs,
                lm_head_input,
                lm_head_output,
            }))
        }

        #[cfg(not(target_vendor = "apple"))]
        {
            let _ = start;
            let _ = eos_token_id;
            anyhow::bail!("Canary CoreML requires Apple platform")
        }
    }
}

impl CanaryEngine {
    pub fn from_runtime(runtime: Arc<CanaryRuntime>) -> anyhow::Result<Self> {
        #[cfg(target_vendor = "apple")]
        {
            let dec_state = runtime
                .decoder
                .new_state()
                .map_err(|e| anyhow::anyhow!("Failed to create decoder state: {e}"))?;
            Ok(Self {
                runtime,
                dec_state,
                buffer: Vec::new(),
                chunk_samples: (SAMPLE_RATE as f64 * CHUNK_SECONDS) as usize,
                elapsed_seconds: 0.0,
            })
        }
        #[cfg(not(target_vendor = "apple"))]
        {
            let _ = runtime;
            anyhow::bail!("Canary CoreML requires Apple platform")
        }
    }

    pub fn load(models_dir: Option<&Path>) -> anyhow::Result<Arc<CanaryRuntime>> {
        CanaryRuntime::load(models_dir)
    }
}

impl CanaryEngine {
    pub fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
        self.buffer.extend_from_slice(samples);
        if self.buffer.len() < self.chunk_samples {
            return Ok(None);
        }

        let chunk: Vec<f32> = self.buffer.drain(..self.chunk_samples).collect();
        let start = self.elapsed_seconds;
        self.elapsed_seconds += CHUNK_SECONDS;

        let text = self.transcribe_chunk(&chunk)?;
        if text.trim().is_empty() {
            return Ok(None);
        }

        Ok(Some(AsrOutput {
            committed: vec![AsrWord {
                text,
                start,
                end: self.elapsed_seconds,
            }],
            tentative: Vec::new(),
        }))
    }

    pub fn finish(&mut self) -> anyhow::Result<AsrOutput> {
        if self.buffer.is_empty() {
            return Ok(AsrOutput::default());
        }

        let chunk = std::mem::take(&mut self.buffer);
        let start = self.elapsed_seconds;
        let duration = chunk.len() as f64 / SAMPLE_RATE as f64;
        self.elapsed_seconds += duration;

        let text = self.transcribe_chunk(&chunk)?;
        Ok(AsrOutput {
            committed: if text.trim().is_empty() {
                Vec::new()
            } else {
                vec![AsrWord {
                    text,
                    start,
                    end: self.elapsed_seconds,
                }]
            },
            tentative: Vec::new(),
        })
    }

    fn transcribe_chunk(&mut self, samples: &[f32]) -> anyhow::Result<String> {
        #[cfg(target_vendor = "apple")]
        {
            let mel = compute_log_mel(samples, &self.runtime.mel_filter)?;
            let mel_frames = mel.len() / N_MELS;

            let encoder_input = pick_input_name(&self.runtime.encoder.inputs(), &["audio", "input_features", "mel", "features"]);
            let encoder_out = run_f32_model(
                &self.runtime.encoder,
                &[(
                    encoder_input.as_str(),
                    &mel,
                    &[1, N_MELS, mel_frames],
                )],
            )?;
            let encoder_key = pick_output_name(&self.runtime.encoder.outputs(), &["encoder_output", "audio_features", "output", "hidden_states"]);
            let (encoder_features, enc_shape) = encoder_out.get_f32(&encoder_key)?;

            let proj_input = pick_input_name(&self.runtime.projection.inputs(), &["encoder_output", "audio_features", "input", "hidden_states"]);
            let proj_out = run_f32_model(
                &self.runtime.projection,
                &[(proj_input.as_str(), &encoder_features, &enc_shape)],
            )?;
            let proj_key = pick_output_name(&self.runtime.projection.outputs(), &["projected", "audio_embs", "output", "hidden_states"]);
            let (audio_embs, emb_shape) = proj_out.get_f32(&proj_key)?;

            let prompt_ids: Vec<i32> = self
                .runtime
                .tokenizer
                .encode(PROMPT, false)
                .map_err(|e| anyhow::anyhow!("Tokenizer encode failed: {e}"))?
                .get_ids()
                .iter()
                .map(|&id| id as i32)
                .collect();

            self.dec_state = self
                .runtime
                .decoder
                .new_state()
                .map_err(|e| anyhow::anyhow!("Failed to reset decoder state: {e}"))?;

            let hidden_dim = emb_shape.last().copied().unwrap_or(2048);
            let audio_len = emb_shape.get(1).copied().unwrap_or(1) as usize;
            let prefill_len = prompt_ids.len() + audio_len;
            let mut prefill_hidden = vec![0.0f32; prefill_len * hidden_dim as usize];

            let prompt_slots = prompt_ids.len();
            for t in 0..audio_len {
                for d in 0..hidden_dim as usize {
                    let src = t * hidden_dim as usize + d;
                    let dst = (prompt_slots + t) * hidden_dim as usize + d;
                    if src < audio_embs.len() && dst < prefill_hidden.len() {
                        prefill_hidden[dst] = audio_embs[src];
                    }
                }
            }

            let prefill_inputs = build_decoder_prefill_inputs(
                &self.runtime.decoder_prefill_inputs,
                &prompt_ids,
                &prefill_hidden,
                &audio_embs,
                &emb_shape,
                prefill_len,
                hidden_dim,
                mel_frames,
            );

            let mut prefill_tensors: Vec<(String, Vec<f32>, Vec<usize>)> = Vec::new();
            let mut prefill_borrowed: Vec<(String, BorrowedTensor<'_>)> = Vec::new();
            for (name, data, shape) in &prefill_inputs {
                prefill_tensors.push((name.clone(), data.clone(), shape.clone()));
            }
            for (name, data, shape) in &prefill_tensors {
                prefill_borrowed.push((
                    name.clone(),
                    BorrowedTensor::from_f32(data, shape)
                        .map_err(|e| anyhow::anyhow!("Prefill tensor {name}: {e}"))?,
                ));
            }
            let prefill_refs: Vec<(&str, &dyn coreml_native::AsMultiArray)> = prefill_borrowed
                .iter()
                .map(|(n, t)| (n.as_str(), t as &dyn coreml_native::AsMultiArray))
                .collect();

            let prefill_pred = self
                .runtime
                .decoder
                .predict_stateful(&prefill_refs, &self.dec_state)
                .map_err(|e| anyhow::anyhow!("Decoder prefill failed: {e}"))?;

            let hidden_key = pick_output_name(&self.runtime.decoder.outputs(), &["hidden_states", "output", "decoder_hidden_states"]);
            let (mut last_hidden, mut hidden_shape) = prefill_pred.get_f32(&hidden_key)?;

            let mut generated: Vec<u32> = Vec::new();
            let mut pos = prefill_len;

            for _step in 0..MAX_NEW_TOKENS {
                let logits = self.run_lm_head(&last_hidden, &hidden_shape)?;
                let next_token = argmax(&logits);
                if next_token == self.runtime.eos_token_id {
                    break;
                }
                generated.push(next_token);

                let token_id = next_token as i32;
                let update_mask = one_hot(pos, 256);
                let valid_mask = vec![1.0f32; 256];

                let decode_inputs = build_decoder_decode_inputs(
                    &self.runtime.decoder_decode_inputs,
                    token_id,
                    &last_hidden,
                    &hidden_shape,
                    &update_mask,
                    &valid_mask,
                );

                let mut decode_tensors: Vec<(String, Vec<f32>, Vec<usize>)> = Vec::new();
                for (name, data, shape) in decode_inputs {
                    decode_tensors.push((name, data, shape));
                }
                let mut decode_borrowed: Vec<(String, BorrowedTensor<'_>)> = Vec::new();
                for (name, data, shape) in &decode_tensors {
                    decode_borrowed.push((
                        name.clone(),
                        BorrowedTensor::from_f32(data, shape)
                            .map_err(|e| anyhow::anyhow!("Decode tensor {name}: {e}"))?,
                    ));
                }
                let decode_refs: Vec<(&str, &dyn coreml_native::AsMultiArray)> = decode_borrowed
                    .iter()
                    .map(|(n, t)| (n.as_str(), t as &dyn coreml_native::AsMultiArray))
                    .collect();

                let decode_pred = self
                    .runtime
                    .decoder
                    .predict_stateful(&decode_refs, &self.dec_state)
                    .map_err(|e| anyhow::anyhow!("Decoder decode failed: {e}"))?;

                (last_hidden, hidden_shape) = decode_pred.get_f32(&hidden_key)?;
                pos += 1;
            }

            if generated.is_empty() {
                return Ok(String::new());
            }

            let text = self
                .runtime
                .tokenizer
                .decode(&generated, true)
                .map_err(|e| anyhow::anyhow!("Tokenizer decode failed: {e}"))?;
            Ok(text)
        }

        #[cfg(not(target_vendor = "apple"))]
        {
            let _ = samples;
            anyhow::bail!("Canary CoreML requires Apple platform")
        }
    }

    #[cfg(target_vendor = "apple")]
    fn run_lm_head(&self, hidden: &[f32], hidden_shape: &[usize]) -> anyhow::Result<Vec<f32>> {
        let pred = run_f32_model(
            &self.runtime.lm_head,
            &[(
                self.runtime.lm_head_input.as_str(),
                hidden,
                hidden_shape,
            )],
        )?;
        let (logits, _) = pred
            .get_f32(&self.runtime.lm_head_output)
            .map_err(|e| anyhow::anyhow!("LM head output: {e}"))?;
        Ok(logits)
    }
}

#[cfg(target_vendor = "apple")]
fn load_coreml_model(models_dir: &Path, stem: &str) -> anyhow::Result<Model> {
    let package = models_dir.join(format!("{stem}.mlpackage"));
    if !package.exists() {
        anyhow::bail!("Missing CoreML package at {}", package.display());
    }

    let compiled = compile_model(&package)
        .map_err(|e| anyhow::anyhow!("Failed to compile {stem}: {e}"))?;

    Model::load(&compiled, ComputeUnits::All)
        .map_err(|e| anyhow::anyhow!("Failed to load compiled {stem}: {e}"))
}

#[cfg(target_vendor = "apple")]
fn run_f32_model(
    model: &Model,
    inputs: &[(&str, &[f32], &[usize])],
) -> anyhow::Result<Prediction> {
    let mut borrowed = Vec::new();
    for (name, data, shape) in inputs {
        let tensor = BorrowedTensor::from_f32(data, shape)
            .map_err(|e| anyhow::anyhow!("Input {name}: {e}"))?;
        borrowed.push((*name, tensor));
    }
    let refs: Vec<(&str, &dyn coreml_native::AsMultiArray)> = borrowed
        .iter()
        .map(|(n, t)| (*n, t as &dyn coreml_native::AsMultiArray))
        .collect();
    model
        .predict(&refs)
        .map_err(|e| anyhow::anyhow!("{e}"))
}

#[cfg(target_vendor = "apple")]
fn log_model_io(label: &str, model: &Model) {
    for desc in model.inputs() {
        tracing::info!(
            model = label,
            io = "input",
            name = desc.name(),
            shape = ?desc.shape(),
            "CoreML IO"
        );
    }
    for desc in model.outputs() {
        tracing::info!(
            model = label,
            io = "output",
            name = desc.name(),
            shape = ?desc.shape(),
            "CoreML IO"
        );
    }
}

#[cfg(target_vendor = "apple")]
fn pick_input_name(inputs: &[coreml_native::FeatureDescription], candidates: &[&str]) -> String {
    for candidate in candidates {
        if inputs.iter().any(|d| d.name() == *candidate) {
            return (*candidate).to_string();
        }
    }
    inputs
        .first()
        .map(|d| d.name().to_string())
        .unwrap_or_else(|| "input".into())
}

#[cfg(target_vendor = "apple")]
fn pick_output_name(outputs: &[coreml_native::FeatureDescription], candidates: &[&str]) -> String {
    for candidate in candidates {
        if outputs.iter().any(|d| d.name() == *candidate) {
            return (*candidate).to_string();
        }
    }
    outputs
        .first()
        .map(|d| d.name().to_string())
        .unwrap_or_else(|| "output".into())
}

#[cfg(target_vendor = "apple")]
fn build_decoder_prefill_inputs(
    input_names: &[String],
    prompt_ids: &[i32],
    prefill_hidden: &[f32],
    audio_embs: &[f32],
    emb_shape: &[usize],
    prefill_len: usize,
    hidden_dim: usize,
    mel_frames: usize,
) -> Vec<(String, Vec<f32>, Vec<usize>)> {
    let mut out = Vec::new();
    for name in input_names {
        let lower = name.to_lowercase();
        if lower.contains("input_ids") || lower == "tokens" {
            let ids: Vec<f32> = prompt_ids.iter().map(|&id| id as f32).collect();
            out.push((name.clone(), ids, vec![1, prompt_ids.len()]));
        } else if lower.contains("hidden_states") {
            out.push((
                name.clone(),
                prefill_hidden.to_vec(),
                vec![1, prefill_len, hidden_dim],
            ));
        } else if lower.contains("audio") || lower.contains("encoder") {
            out.push((name.clone(), audio_embs.to_vec(), emb_shape.to_vec()));
        } else if lower.contains("mask") {
            let len = if lower.contains("encoder") {
                emb_shape.get(1).copied().unwrap_or(mel_frames)
            } else {
                prefill_len
            };
            out.push((name.clone(), vec![1.0; len], vec![1, len]));
        } else {
            tracing::debug!(input = %name, "Skipping unknown decoder prefill input");
        }
    }
    out
}

#[cfg(target_vendor = "apple")]
fn build_decoder_decode_inputs(
    input_names: &[String],
    token_id: i32,
    hidden: &[f32],
    hidden_shape: &[usize],
    update_mask: &[f32],
    valid_mask: &[f32],
) -> Vec<(String, Vec<f32>, Vec<usize>)> {
    let mut out = Vec::new();
    for name in input_names {
        let lower = name.to_lowercase();
        if lower.contains("input_ids") || lower == "tokens" {
            out.push((name.clone(), vec![token_id as f32], vec![1, 1]));
        } else if lower.contains("hidden_states") {
            out.push((name.clone(), hidden.to_vec(), hidden_shape.to_vec()));
        } else if lower.contains("cache_update") {
            out.push((name.clone(), update_mask.to_vec(), vec![1, 256]));
        } else if lower.contains("cache_valid") {
            out.push((name.clone(), valid_mask.to_vec(), vec![1, 256]));
        } else if lower.contains("mask") {
            out.push((name.clone(), vec![1.0], vec![1, 1]));
        } else {
            tracing::debug!(input = %name, "Skipping unknown decoder decode input");
        }
    }
    out
}

fn load_mel_filter(path: &Path) -> anyhow::Result<Array2<f32>> {
    let bytes = fs::read(path)
        .map_err(|e| anyhow::anyhow!("Failed to read mel filter {}: {e}", path.display()))?;
    if bytes.len() % 4 != 0 {
        anyhow::bail!("Mel filter file size is not a multiple of 4");
    }
    let values: Vec<f32> = bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect();

    let n_freq = N_FFT / 2 + 1;
    if values.len() != N_MELS * n_freq {
        anyhow::bail!(
            "Unexpected mel filter size: {} floats, expected {}",
            values.len(),
            N_MELS * n_freq
        );
    }

    Array2::from_shape_vec((N_MELS, n_freq), values)
        .map_err(|e| anyhow::anyhow!("Failed to shape mel filter: {e}"))
}

fn compute_log_mel(samples: &[f32], mel_filter: &Array2<f32>) -> anyhow::Result<Vec<f32>> {
    if samples.is_empty() {
        return Ok(Vec::new());
    }

    let n_frames = samples.len().saturating_sub(N_FFT) / HOP_LENGTH + 1;
    let n_freq = N_FFT / 2 + 1;
    let mut mel_data = vec![0.0f32; n_frames * N_MELS];

    let window: Vec<f32> = (0..N_FFT)
        .map(|i| {
            0.54 - 0.46 * (2.0 * std::f32::consts::PI * i as f32 / (N_FFT - 1) as f32).cos()
        })
        .collect();

    let mut planner = rustfft::FftPlanner::new();
    let fft = planner.plan_fft_forward(N_FFT);

    for frame in 0..n_frames {
        let start = frame * HOP_LENGTH;
        let mut buffer: Vec<rustfft::num_complex::Complex<f32>> = (0..N_FFT)
            .map(|i| {
                let sample = samples.get(start + i).copied().unwrap_or(0.0) * window[i];
                rustfft::num_complex::Complex::new(sample, 0.0)
            })
            .collect();
        fft.process(&mut buffer);

        let power: Vec<f32> = buffer
            .iter()
            .take(n_freq)
            .map(|c| c.norm_sqr())
            .collect();

        for mel in 0..N_MELS {
            let mut sum = 0.0f32;
            for freq in 0..n_freq {
                sum += power[freq] * mel_filter[[mel, freq]];
            }
            mel_data[frame * N_MELS + mel] = (sum + 1e-10).log10() * 10.0;
        }
    }

    Ok(mel_data)
}

fn argmax(values: &[f32]) -> u32 {
    values
        .iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(i, _)| i as u32)
        .unwrap_or(0)
}

fn one_hot(pos: usize, len: usize) -> Vec<f32> {
    let mut mask = vec![0.0f32; len];
    if pos < len {
        mask[pos] = 1.0;
    }
    mask
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mel_filter_shape() {
        let n_freq = N_FFT / 2 + 1;
        let data: Vec<f32> = vec![0.0; N_MELS * n_freq];
        let tmp = std::env::temp_dir().join("canary_mel_test.bin");
        let bytes: Vec<u8> = data
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        fs::write(&tmp, bytes).unwrap();
        let filter = load_mel_filter(&tmp).unwrap();
        assert_eq!(filter.shape(), &[N_MELS, n_freq]);
        let _ = fs::remove_file(tmp);
    }

    #[test]
    fn log_mel_produces_frames() {
        let n_freq = N_FFT / 2 + 1;
        let filter = Array2::<f32>::zeros((N_MELS, n_freq));
        let samples = vec![0.0f32; SAMPLE_RATE as usize];
        let mel = compute_log_mel(&samples, &filter).unwrap();
        assert!(!mel.is_empty());
        assert_eq!(mel.len() % N_MELS, 0);
    }
}
