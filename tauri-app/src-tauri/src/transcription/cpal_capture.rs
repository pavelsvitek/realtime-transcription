use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample, StreamConfig};
use std::sync::mpsc;
use yamabiko_whisper::{downmix_interleaved, AudioSample};

pub struct OpenedCpalStream {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
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

    let stream = match sample_format {
        SampleFormat::F32 => build_input_stream::<f32>(device, &stream_config, channels, sender)?,
        SampleFormat::F64 => build_input_stream::<f64>(device, &stream_config, channels, sender)?,
        SampleFormat::I8 => build_input_stream::<i8>(device, &stream_config, channels, sender)?,
        SampleFormat::I16 => build_input_stream::<i16>(device, &stream_config, channels, sender)?,
        SampleFormat::I32 => build_input_stream::<i32>(device, &stream_config, channels, sender)?,
        SampleFormat::I64 => build_input_stream::<i64>(device, &stream_config, channels, sender)?,
        SampleFormat::U8 => build_input_stream::<u8>(device, &stream_config, channels, sender)?,
        SampleFormat::U16 => build_input_stream::<u16>(device, &stream_config, channels, sender)?,
        SampleFormat::U32 => build_input_stream::<u32>(device, &stream_config, channels, sender)?,
        SampleFormat::U64 => build_input_stream::<u64>(device, &stream_config, channels, sender)?,
        other => anyhow::bail!("Unsupported sample format: {other:?}"),
    };

    stream.play()?;
    tracing::info!(device = %device_name, "cpal audio stream started");

    Ok(OpenedCpalStream { stream, sample_rate })
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &StreamConfig,
    channels: usize,
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<cpal::Stream>
where
    T: SizedSample + AudioSample + Send + 'static,
{
    Ok(device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let mono = downmix_interleaved(data, channels);
            if sender.try_send(mono).is_err() {
                tracing::warn!("Audio channel full, dropping frame");
            }
        },
        |err| {
            tracing::error!(%err, "cpal stream error");
        },
        None,
    )?)
}
