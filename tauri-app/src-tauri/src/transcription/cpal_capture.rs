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
) -> anyhow::Result<OpenedCpalStream> {
    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    let supported = device
        .default_input_config()
        .map_err(|e| anyhow::anyhow!("Failed to query input config for {device_name}: {e}"))?;

    let channels = supported.channels();
    let sample_format = supported.sample_format();
    open_stream_with_config(device, &device_name, supported.into(), channels, sample_format, sender)
}

/// Opens a loopback stream on the default output device (macOS 15+).
pub fn open_loopback_stream(
    device: &cpal::Device,
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<OpenedCpalStream> {
    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    let supported = device
        .default_output_config()
        .map_err(|e| anyhow::anyhow!("Failed to query output config for {device_name}: {e}"))?;

    let channels = supported.channels();
    let sample_format = supported.sample_format();
    open_stream_with_config(device, &device_name, supported.into(), channels, sample_format, sender)
}

fn open_stream_with_config(
    device: &cpal::Device,
    device_name: &str,
    stream_config: StreamConfig,
    channels: u16,
    sample_format: SampleFormat,
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<OpenedCpalStream> {
    let sample_rate = stream_config.sample_rate;
    let channels = channels as usize;

    tracing::info!(
        device = %device_name,
        sample_rate,
        channels,
        ?sample_format,
        "Opening cpal audio stream (ASR pipeline will resample to 16 kHz mono)"
    );

    let counters = CaptureCounters::default();
    let stream = match sample_format {
        SampleFormat::F32 => {
            build_input_stream::<f32>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::F64 => {
            build_input_stream::<f64>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::I8 => {
            build_input_stream::<i8>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::I16 => {
            build_input_stream::<i16>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::I32 => {
            build_input_stream::<i32>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::I64 => {
            build_input_stream::<i64>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::U8 => {
            build_input_stream::<u8>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::U16 => {
            build_input_stream::<u16>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::U32 => {
            build_input_stream::<u32>(device, &stream_config, channels, sender, counters.clone())?
        }
        SampleFormat::U64 => {
            build_input_stream::<u64>(device, &stream_config, channels, sender, counters.clone())?
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
) -> anyhow::Result<cpal::Stream>
where
    T: SizedSample + Sample + Send + 'static,
    f32: FromSample<T>,
{
    Ok(device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let mono = downmix_interleaved(data, channels);
            let sample_count = mono.len() as u64;
            if sender.try_send(mono).is_err() {
                DROPPED_FRAMES.fetch_add(1, Ordering::Relaxed);
                DROPPED_SAMPLES.fetch_add(sample_count, Ordering::Relaxed);
                counters
                    .dropped_frames
                    .fetch_add(1, Ordering::Relaxed);
                counters
                    .dropped_samples
                    .fetch_add(sample_count, Ordering::Relaxed);
                tracing::warn!(
                    samples = sample_count,
                    "Audio channel full, dropping frame"
                );
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
        return data.iter().map(|sample| sample.to_sample::<f32>()).collect();
    }

    let mut mono = Vec::with_capacity(data.len() / channels);
    for frame in data.chunks_exact(channels) {
        let sum: f32 = frame
            .iter()
            .map(|sample| sample.to_sample::<f32>())
            .sum();
        mono.push(sum / channels as f32);
    }
    mono
}
