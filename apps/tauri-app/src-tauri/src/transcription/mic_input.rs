use cpal::traits::HostTrait;
use std::sync::mpsc;

use super::cpal_capture;

/// Captured mic stream and the sample rate fed into the ASR pipeline (mono).
pub struct OpenedMic {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
    pub device_name: String,
    pub counters: super::cpal_capture::CaptureCounters,
}

pub fn open_mic_stream(sender: mpsc::SyncSender<Vec<f32>>) -> anyhow::Result<OpenedMic> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| anyhow::anyhow!("No input device available"))?;

    let opened = cpal_capture::open_input_stream(&device, sender)?;
    Ok(OpenedMic {
        stream: opened.stream,
        sample_rate: opened.sample_rate,
        device_name: opened.device_name,
        counters: opened.counters,
    })
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
