use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, SizedSample};
use std::sync::mpsc;
use yamabiko_whisper::{downmix_interleaved, AudioSample};

/// Captured mic stream and the sample rate fed into the ASR pipeline (mono).
pub struct OpenedMic {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
}

pub fn open_mic_stream(sender: mpsc::SyncSender<Vec<f32>>) -> anyhow::Result<OpenedMic> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow::anyhow!("No input device available"))?;

    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    let supported = device
        .default_input_config()
        .map_err(|e| anyhow::anyhow!("Failed to query default input config: {e}"))?;

    let sample_rate = supported.sample_rate().0;
    let channels = supported.channels() as usize;
    let sample_format = supported.sample_format();
    let stream_config: cpal::StreamConfig = supported.into();

    tracing::info!(
        device = %device_name,
        sample_rate,
        channels,
        ?sample_format,
        "Opening mic input (ASR pipeline will resample to 16 kHz mono)"
    );

    let stream = match sample_format {
        SampleFormat::F32 => build_input_stream::<f32>(&device, &stream_config, channels, sender)?,
        SampleFormat::F64 => build_input_stream::<f64>(&device, &stream_config, channels, sender)?,
        SampleFormat::I8 => build_input_stream::<i8>(&device, &stream_config, channels, sender)?,
        SampleFormat::I16 => build_input_stream::<i16>(&device, &stream_config, channels, sender)?,
        SampleFormat::I32 => build_input_stream::<i32>(&device, &stream_config, channels, sender)?,
        SampleFormat::I64 => build_input_stream::<i64>(&device, &stream_config, channels, sender)?,
        SampleFormat::U8 => build_input_stream::<u8>(&device, &stream_config, channels, sender)?,
        SampleFormat::U16 => build_input_stream::<u16>(&device, &stream_config, channels, sender)?,
        SampleFormat::U32 => build_input_stream::<u32>(&device, &stream_config, channels, sender)?,
        SampleFormat::U64 => build_input_stream::<u64>(&device, &stream_config, channels, sender)?,
        other => anyhow::bail!("Unsupported sample format: {other:?}"),
    };

    stream.play()?;
    tracing::info!("Mic stream started");

    Ok(OpenedMic { stream, sample_rate })
}

fn build_input_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
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

/// Compute RMS of a mono f32 audio buffer, returned in [0.0, 1.0].
pub fn compute_rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = samples.iter().map(|s| s * s).sum();
    (sum_sq / samples.len() as f32).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_of_silence_is_zero() {
        let samples = vec![0.0f32; 1024];
        assert_eq!(compute_rms(&samples), 0.0);
    }

    #[test]
    fn rms_of_empty_is_zero() {
        assert_eq!(compute_rms(&[]), 0.0);
    }

    #[test]
    fn rms_of_constant_signal() {
        let samples = vec![0.5f32; 100];
        let rms = compute_rms(&samples);
        assert!((rms - 0.5).abs() < 0.001);
    }
}
