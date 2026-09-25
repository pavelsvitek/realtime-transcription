use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use super::meeting;
use super::timeline::{samples_to_ms, SpeakerTimeline};

const POLL_INTERVAL: Duration = Duration::from_millis(250);

/// Background poll of Zoom or Teams. Dropping it stops the thread.
pub struct SpeakerWatch {
    handle: Option<JoinHandle<()>>,
}

impl SpeakerWatch {
    pub fn stop(mut self) {
        self.shutdown();
    }

    fn shutdown(&mut self) {
        if let Some(handle) = self.handle.take() {
            if let Err(error) = handle.join() {
                tracing::error!("Speaker watch panicked: {error:?}");
            }
        }
    }
}

impl Drop for SpeakerWatch {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn start(
    timeline: Arc<Mutex<SpeakerTimeline>>,
    captured_samples: Arc<AtomicU64>,
    sample_rate: u32,
    stop: Arc<AtomicBool>,
) -> SpeakerWatch {
    let handle = std::thread::Builder::new()
        .name("speaker-watch".into())
        .spawn(move || poll_loop(timeline, captured_samples, sample_rate, stop))
        .inspect_err(|error| tracing::error!(%error, "Failed to start speaker watch"))
        .ok();
    SpeakerWatch { handle }
}

fn poll_loop(
    timeline: Arc<Mutex<SpeakerTimeline>>,
    captured_samples: Arc<AtomicU64>,
    sample_rate: u32,
    stop: Arc<AtomicBool>,
) {
    let mut warned = false;
    while !stop.load(Ordering::Relaxed) {
        match meeting::read_speakers() {
            Ok(names) => {
                let at_ms = samples_to_ms(captured_samples.load(Ordering::Relaxed), sample_rate);
                if let Ok(mut timeline) = timeline.lock() {
                    timeline.push(at_ms, names);
                }
            }
            Err(error) => {
                if !warned {
                    warned = true;
                    tracing::warn!(error = %error, "Speaker names unavailable");
                } else {
                    tracing::debug!(error = %error, "Speaker names unavailable");
                }
            }
        }
        let slice = Duration::from_millis(10);
        let mut waited = Duration::ZERO;
        while waited < POLL_INTERVAL && !stop.load(Ordering::Relaxed) {
            std::thread::sleep(slice);
            waited += slice;
        }
    }
}
