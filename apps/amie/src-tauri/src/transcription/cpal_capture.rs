use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample, StreamConfig};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Arc;

static DROPPED_SAMPLES: AtomicU64 = AtomicU64::new(0);
static CAPTURED_SAMPLES: AtomicU64 = AtomicU64::new(0);
static DROPPED_FRAMES: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Default)]
pub struct CaptureCounters {
    captured: Arc<AtomicU64>,
    dropped_samples: Arc<AtomicU64>,
    dropped_frames: Arc<AtomicU64>,
}

impl CaptureCounters {
    pub fn stats(&self) -> (u64, u64, u64) {
        (
            self.captured.load(Ordering::Relaxed),
            self.dropped_samples.load(Ordering::Relaxed),
            self.dropped_frames.load(Ordering::Relaxed),
        )
    }

    /// Samples queued on this stream. Speaker polls use this clock, not the
    /// process-wide `CAPTURED_SAMPLES` counter.
    pub fn captured_counter(&self) -> Arc<AtomicU64> {
        Arc::clone(&self.captured)
    }
}

/// Reset capture counters (call before each golden E2E run).
pub fn reset_capture_stats() {
    DROPPED_SAMPLES.store(0, Ordering::Relaxed);
    CAPTURED_SAMPLES.store(0, Ordering::Relaxed);
    DROPPED_FRAMES.store(0, Ordering::Relaxed);
}

/// `(captured_samples, dropped_samples, dropped_frames)`
pub fn capture_stats() -> (u64, u64, u64) {
    (
        CAPTURED_SAMPLES.load(Ordering::Relaxed),
        DROPPED_SAMPLES.load(Ordering::Relaxed),
        DROPPED_FRAMES.load(Ordering::Relaxed),
    )
}

/// Options for (re)opening a stream. Used by device hot-swap so a new stream
/// continues the old one's clock and sample rate.
#[derive(Clone, Default)]
pub struct CaptureOptions {
    /// Keep counting into these counters instead of fresh ones.
    pub counters: Option<CaptureCounters>,
    /// Resample the device audio to this rate (the running pipeline's rate).
    pub target_rate: Option<u32>,
}

/// Streaming linear-interpolation resampler for mono f32 audio.
struct LinearResampler {
    step: f64,
    pos: f64,
    prev: f32,
}

impl LinearResampler {
    fn new(from: u32, to: u32) -> Self {
        Self {
            step: from as f64 / to as f64,
            pos: 0.0,
            prev: 0.0,
        }
    }

    fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let n = input.len() as isize;
        let mut out = Vec::with_capacity((input.len() as f64 / self.step) as usize + 1);
        let sample = |k: isize, prev: f32| if k < 0 { prev } else { input[k as usize] };
        // Virtual index -1 is the last sample of the previous chunk.
        while (self.pos.floor() as isize) + 1 < n {
            let i = self.pos.floor() as isize;
            let frac = (self.pos - i as f64) as f32;
            let a = sample(i, self.prev);
            let b = sample(i + 1, self.prev);
            out.push(a + (b - a) * frac);
            self.pos += self.step;
        }
        if n > 0 {
            self.pos -= n as f64;
            self.prev = input[(n - 1) as usize];
        }
        out
    }
}

pub struct OpenedCpalStream {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
    pub device_name: String,
    pub counters: CaptureCounters,
}

/// Opens an input stream on `device` and forwards mono f32 chunks to `sender`.
pub fn open_input_stream(
    device: &cpal::Device,
    sender: mpsc::SyncSender<Vec<f32>>,
    options: CaptureOptions,
) -> anyhow::Result<OpenedCpalStream> {
    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    let supported = device
        .default_input_config()
        .map_err(|e| anyhow::anyhow!("Failed to query input config for {device_name}: {e}"))?;

    let channels = supported.channels();
    let sample_format = supported.sample_format();
    open_stream_with_config(
        device,
        &device_name,
        supported.into(),
        channels,
        sample_format,
        sender,
        options,
    )
}

/// Opens a loopback stream on the default output device (macOS 15+).
pub fn open_loopback_stream(
    device: &cpal::Device,
    sender: mpsc::SyncSender<Vec<f32>>,
    options: CaptureOptions,
) -> anyhow::Result<OpenedCpalStream> {
    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    let supported = device
        .default_output_config()
        .map_err(|e| anyhow::anyhow!("Failed to query output config for {device_name}: {e}"))?;

    let channels = supported.channels();
    let sample_format = supported.sample_format();
    open_stream_with_config(
        device,
        &device_name,
        supported.into(),
        channels,
        sample_format,
        sender,
        options,
    )
}

fn open_stream_with_config(
    device: &cpal::Device,
    device_name: &str,
    stream_config: StreamConfig,
    channels: u16,
    sample_format: SampleFormat,
    sender: mpsc::SyncSender<Vec<f32>>,
    options: CaptureOptions,
) -> anyhow::Result<OpenedCpalStream> {
    let device_rate = stream_config.sample_rate;
    let resampler = match options.target_rate {
        Some(target) if target != device_rate => Some(LinearResampler::new(device_rate, target)),
        _ => None,
    };
    let sample_rate = options.target_rate.unwrap_or(device_rate);
    let channels = channels as usize;

    tracing::info!(
        device = %device_name,
        device_rate,
        pipeline_rate = sample_rate,
        channels,
        ?sample_format,
        "Opening cpal audio stream (ASR pipeline will resample to 16 kHz mono)"
    );

    let counters = options.counters.unwrap_or_default();
    let stream = match sample_format {
        SampleFormat::F32 => {
            build_input_stream::<f32>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::F64 => {
            build_input_stream::<f64>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::I8 => {
            build_input_stream::<i8>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::I16 => {
            build_input_stream::<i16>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::I32 => {
            build_input_stream::<i32>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::I64 => {
            build_input_stream::<i64>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::U8 => {
            build_input_stream::<u8>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::U16 => {
            build_input_stream::<u16>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::U32 => {
            build_input_stream::<u32>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        SampleFormat::U64 => {
            build_input_stream::<u64>(
                device,
                &stream_config,
                channels,
                sender,
                counters.clone(),
                resampler,
            )?
        }
        other => anyhow::bail!("Unsupported sample format: {other:?}"),
    };

    stream.play()?;
    tracing::info!(device = %device_name, "cpal audio stream started");

    Ok(OpenedCpalStream {
        stream,
        sample_rate,
        device_name: device_name.to_string(),
        counters,
    })
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: usize,
    sender: mpsc::SyncSender<Vec<f32>>,
    counters: CaptureCounters,
    mut resampler: Option<LinearResampler>,
) -> anyhow::Result<cpal::Stream>
where
    T: SizedSample + Sample + Send + 'static,
    f32: FromSample<T>,
{
    Ok(device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let mut mono = downmix_interleaved(data, channels);
            if let Some(resampler) = resampler.as_mut() {
                mono = resampler.process(&mono);
            }
            let sample_count = mono.len() as u64;
            if sender.try_send(mono).is_err() {
                DROPPED_FRAMES.fetch_add(1, Ordering::Relaxed);
                DROPPED_SAMPLES.fetch_add(sample_count, Ordering::Relaxed);
                counters.dropped_frames.fetch_add(1, Ordering::Relaxed);
                counters
                    .dropped_samples
                    .fetch_add(sample_count, Ordering::Relaxed);
                tracing::warn!(samples = sample_count, "Audio channel full, dropping frame");
            } else {
                CAPTURED_SAMPLES.fetch_add(sample_count, Ordering::Relaxed);
                counters.captured.fetch_add(sample_count, Ordering::Relaxed);
            }
        },
        |err| {
            tracing::error!(%err, "cpal stream error");
        },
        None,
    )?)
}

fn downmix_interleaved<T>(data: &[T], channels: usize) -> Vec<f32>
where
    T: Sample,
    f32: FromSample<T>,
{
    if channels <= 1 {
        return data
            .iter()
            .map(|sample| sample.to_sample::<f32>())
            .collect();
    }

    let mut mono = Vec::with_capacity(data.len() / channels);
    for frame in data.chunks_exact(channels) {
        let sum: f32 = frame.iter().map(|sample| sample.to_sample::<f32>()).sum();
        mono.push(sum / channels as f32);
    }
    mono
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resampler_keeps_duration_across_chunks() {
        let mut r = LinearResampler::new(32_000, 48_000);
        let chunk = vec![0.5f32; 320];
        let total: usize = (0..100).map(|_| r.process(&chunk).len()).sum();
        let expected = 100 * 320 * 48_000 / 32_000;
        assert!((total as i64 - expected as i64).abs() <= 2, "{total} vs {expected}");
    }

    #[test]
    fn resampler_preserves_constant_signal() {
        let mut r = LinearResampler::new(48_000, 44_100);
        let _ = r.process(&vec![0.25f32; 480]);
        let out = r.process(&vec![0.25f32; 480]);
        assert!(out.iter().all(|s| (s - 0.25).abs() < 1e-5));
    }
}
