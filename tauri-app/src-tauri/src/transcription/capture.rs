use std::sync::mpsc;

use super::audio_source::AudioSource;
use super::mic_input;

/// Keeps an audio input alive until dropped (stops capture).
pub struct OpenedCapture {
    pub sample_rate: u32,
    _guard: CaptureGuard,
}

enum CaptureGuard {
    Cpal(#[allow(dead_code)] cpal::Stream),
    System(#[allow(dead_code)] super::system_audio::SystemAudioCapture),
}

pub fn open_capture(
    source: AudioSource,
    sender: mpsc::SyncSender<Vec<f32>>,
) -> anyhow::Result<OpenedCapture> {
    match source {
        AudioSource::Mic => {
            let opened = mic_input::open_mic_stream(sender)?;
            Ok(OpenedCapture {
                sample_rate: opened.sample_rate,
                _guard: CaptureGuard::Cpal(opened.stream),
            })
        }
        AudioSource::SystemAudio => {
            let opened = super::system_audio::open_system_audio_stream(sender)?;
            Ok(OpenedCapture {
                sample_rate: opened.sample_rate,
                _guard: CaptureGuard::System(opened),
            })
        }
        AudioSource::Both => {
            // `Both` is a session-level mode; callers must open Mic and SystemAudio separately.
            panic!("open_capture called with AudioSource::Both — open each stream individually");
        }
    }
}
