//! System audio capture for repeatable Chrome/YouTube testing.
//!
//! On macOS 15+, uses cpal's Core Audio loopback tap on the default output
//! device so anything playing through the speakers (e.g. a YouTube tab in Chrome)
//! is transcribed without a virtual audio cable.

use cpal::traits::DeviceTrait;
use std::sync::mpsc;

use super::cpal_capture::{self, CaptureOptions};

pub struct SystemAudioCapture {
    pub stream: cpal::Stream,
    /// Declared after `stream`: the stream must stop before its tap is destroyed.
    #[cfg(target_os = "macos")]
    _tap: super::output_tap::OutputTap,
    pub sample_rate: u32,
    pub device_name: String,
    pub device_key: Option<String>,
    pub counters: super::cpal_capture::CaptureCounters,
}

/// Captures system output audio (loopback) and forwards mono f32 chunks to `sender`.
///
/// `selection` picks the output device to tap; `None` follows the system default.
pub fn open_system_audio_stream(
    sender: mpsc::SyncSender<Vec<f32>>,
    selection: &Option<String>,
    options: CaptureOptions,
) -> anyhow::Result<SystemAudioCapture> {
    let device = crate::audio_device::resolve_output(selection)
        .ok_or_else(|| anyhow::anyhow!("No output device available"))?;
    let device_key = crate::audio_device::device_key(&device);

    tracing::info!(
        device = %device.name().unwrap_or_else(|_| "output".into()),
        "Opening system audio loopback (play YouTube in Chrome on the default output)"
    );

    // Tap the output ourselves and read it as an input. cpal's loopback reads
    // the device's microphone instead when the output also has an input
    // (USB headsets, speakerphones).
    let output_uid = device_key
        .as_deref()
        .and_then(|key| key.strip_prefix("coreaudio:"))
        .ok_or_else(|| anyhow::anyhow!("Output device has no stable id"))?;
    let tap = super::output_tap::OutputTap::new(output_uid)?;
    let tap_device = tap.input_device()?;
    let mut opened = cpal_capture::open_input_stream(&tap_device, sender, options)?;
    // Report the speakers being captured, not the tap's aggregate.
    opened.device_name = device.name().unwrap_or_else(|_| "output".into());
    Ok(SystemAudioCapture {
        stream: opened.stream,
        _tap: tap,
        sample_rate: opened.sample_rate,
        device_name: opened.device_name,
        device_key,
        counters: opened.counters,
    })
}
