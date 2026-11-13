//! "Play a test sound" on the setup wizard's System audio step.
//!
//! macOS has no API that says whether Amie may record system audio: without the
//! System Audio Recording grant the loopback tap opens fine and only delivers
//! silence. So the test listens on the tap while a short system sound plays.

use serde::Serialize;
use std::process::Command;
use std::sync::mpsc;
use std::time::{Duration, Instant};
use tauri::State;

use crate::state::TranscriptionHandle;
use crate::transcription::cpal_capture::CaptureOptions;
use crate::transcription::system_audio::open_system_audio_stream;

/// Played through the default output while the tap listens.
const TEST_SOUND: &str = "/System/Library/Sounds/Glass.aiff";
/// How long to listen after the sound starts. Glass is under a second.
const LISTEN_FOR: Duration = Duration::from_millis(2_000);
/// Peak sample level that counts as "heard". A silent tap stays at 0.
const HEARD_PEAK: f32 = 0.01;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAudioTest {
    pub heard: bool,
    /// Loudest sample seen, 0–1.
    pub peak: f32,
    /// The speakers that were tapped.
    pub device: String,
}

#[tauri::command(async)]
pub fn test_system_audio(
    state: State<'_, TranscriptionHandle>,
) -> Result<SystemAudioTest, String> {
    if state.service.snapshot().active {
        return Err("Stop the meeting before testing system audio.".into());
    }
    // cpal streams are not Send: open, listen and close on one thread.
    std::thread::spawn(run_test)
        .join()
        .map_err(|_| "The system audio test stopped unexpectedly.".to_string())?
        .map_err(|e| e.to_string())
}

fn run_test() -> anyhow::Result<SystemAudioTest> {
    let (sender, receiver) = mpsc::sync_channel::<Vec<f32>>(512);
    let capture = open_system_audio_stream(sender, &None, CaptureOptions::default())?;
    let device = capture.device_name.clone();

    let mut player = Command::new("/usr/bin/afplay").arg(TEST_SOUND).spawn()?;
    let deadline = Instant::now() + LISTEN_FOR;
    let mut peak = 0.0_f32;
    while Instant::now() < deadline {
        if let Ok(chunk) = receiver.recv_timeout(Duration::from_millis(100)) {
            peak = chunk.iter().fold(peak, |max, sample| max.max(sample.abs()));
        }
    }
    let _ = player.wait();
    drop(capture);

    tracing::info!(%device, peak, "system audio test finished");
    Ok(SystemAudioTest {
        heard: heard(peak),
        peak,
        device,
    })
}

fn heard(peak: f32) -> bool {
    peak >= HEARD_PEAK
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_is_not_heard() {
        assert!(!heard(0.0));
        assert!(!heard(0.004));
    }

    #[test]
    fn a_played_sound_is_heard() {
        assert!(heard(0.01));
        assert!(heard(0.35));
    }

    #[test]
    fn result_serializes_in_camel_case() {
        let json = serde_json::to_string(&SystemAudioTest {
            heard: true,
            peak: 0.5,
            device: "MacBook Pro Speakers".into(),
        })
        .unwrap();
        assert!(json.contains("\"heard\":true"));
        assert!(json.contains("\"device\""));
    }
}
