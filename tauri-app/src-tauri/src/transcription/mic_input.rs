use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::mpsc;

pub struct MicConfig {
    pub sample_rate: u32,
    pub channels: u16,
}

impl Default for MicConfig {
    fn default() -> Self {
        Self {
            sample_rate: 16_000,
            channels: 1,
        }
    }
}

pub fn build_stream_config(config: &MicConfig) -> cpal::StreamConfig {
    cpal::StreamConfig {
        channels: config.channels,
        sample_rate: cpal::SampleRate(config.sample_rate),
        buffer_size: cpal::BufferSize::Default,
    }
}

pub fn open_mic_stream(
    config: &MicConfig,
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<cpal::Stream> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow::anyhow!("No input device available"))?;

    let device_name = device.name().unwrap_or_else(|_| "unknown".into());
    tracing::info!(
        device = %device_name,
        sample_rate = config.sample_rate,
        channels = config.channels,
        "Opening mic input"
    );

    let stream_config = build_stream_config(config);

    let stream = device.build_input_stream(
        &stream_config,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
            if sender.try_send(data.to_vec()).is_err() {
                tracing::warn!("Audio channel full, dropping frame");
            }
        },
        |err| {
            tracing::error!(%err, "cpal stream error");
        },
        None,
    )?;

    stream.play()?;
    tracing::info!("Mic stream started");

    Ok(stream)
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
    fn build_stream_config_maps_correctly() {
        let config = MicConfig {
            sample_rate: 44_100,
            channels: 2,
        };
        let stream_config = build_stream_config(&config);
        assert_eq!(stream_config.sample_rate.0, 44_100);
        assert_eq!(stream_config.channels, 2);
    }

    #[test]
    fn default_mic_config_is_16khz_mono() {
        let config = MicConfig::default();
        assert_eq!(config.sample_rate, 16_000);
        assert_eq!(config.channels, 1);
    }

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
