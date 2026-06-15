//! System audio capture for repeatable Chrome/YouTube testing.
//!
//! On macOS 15+, uses cpal's Core Audio loopback tap on the default output
//! device so anything playing through the speakers (e.g. a YouTube tab in Chrome)
//! is transcribed without a virtual audio cable.

use cpal::traits::{DeviceTrait, HostTrait};
use std::sync::mpsc;

use super::cpal_capture;

pub struct SystemAudioCapture {
    pub stream: cpal::Stream,
    pub sample_rate: u32,
}

/// Captures system output audio (loopback) and forwards mono f32 chunks to `sender`.
pub fn open_system_audio_stream(
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<SystemAudioCapture> {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .ok_or_else(|| anyhow::anyhow!("No default output device available"))?;

    tracing::info!(
        device = %device.name().unwrap_or_else(|_| "output".into()),
        "Opening system audio loopback (play YouTube in Chrome on the default output)"
    );

    let opened = cpal_capture::open_loopback_stream(&device, sender)?;
    Ok(SystemAudioCapture {
        stream: opened.stream,
        sample_rate: opened.sample_rate,
    })
}
