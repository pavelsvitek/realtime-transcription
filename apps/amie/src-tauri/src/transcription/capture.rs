use std::sync::mpsc;

use super::audio_source::AudioSource;
use super::cpal_capture::CaptureOptions;
use crate::audio_device::DeviceSelection;
use super::mic_input;

/// Keeps an audio input alive until dropped (stops capture).
pub struct OpenedCapture {
    pub sample_rate: u32,
    pub device_name: String,
    /// Stable id of the opened device; `None` if the host could not report one.
    pub device_key: Option<String>,
    pub counters: super::cpal_capture::CaptureCounters,
    _guard: CaptureGuard,
}

enum CaptureGuard {
    Cpal(#[allow(dead_code)] cpal::Stream),
    System(#[allow(dead_code)] super::system_audio::SystemAudioCapture),
}

pub fn open_capture(
    source: AudioSource,
    sender: mpsc::SyncSender<Vec<f32>>,
    selection: &DeviceSelection,
    options: CaptureOptions,
) -> anyhow::Result<OpenedCapture> {
    match source {
        AudioSource::Mic => {
            let opened = mic_input::open_mic_stream(sender, &selection.input, options)?;
            Ok(OpenedCapture {
                sample_rate: opened.sample_rate,
                device_name: opened.device_name,
                device_key: opened.device_key,
                counters: opened.counters,
                _guard: CaptureGuard::Cpal(opened.stream),
            })
        }
        AudioSource::SystemAudio => {
            let opened = super::system_audio::open_system_audio_stream(sender, &selection.output, options)?;
            Ok(OpenedCapture {
                sample_rate: opened.sample_rate,
                device_name: opened.device_name.clone(),
                device_key: opened.device_key.clone(),
                counters: opened.counters.clone(),
                _guard: CaptureGuard::System(opened),
            })
        }
        AudioSource::Both => {
            // `Both` is a session-level mode; callers must open Mic and SystemAudio separately.
            panic!("open_capture called with AudioSource::Both — open each stream individually");
        }
    }
}
