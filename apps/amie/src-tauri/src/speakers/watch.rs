use std::collections::BTreeSet;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;
use std::time::Duration;

use super::meet_bridge::MeetBridge;
use super::meeting;
use super::sink::SpeakerSink;

/// Empty polls while a meeting app is open. A few misses keep the last
/// speaker so one failed read does not punch a hole through an utterance.
const HOLD_POLLS: u32 = 4;

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

pub fn start(sink: SpeakerSink, stop: Arc<AtomicBool>, meet_bridge: MeetBridge) -> SpeakerWatch {
    let handle = std::thread::Builder::new()
        .name("speaker-watch".into())
        .spawn(move || poll_loop(sink, stop, meet_bridge))
        .inspect_err(|error| tracing::error!(%error, "Failed to start speaker watch"))
        .ok();
    SpeakerWatch { handle }
}

fn poll_loop(sink: SpeakerSink, stop: Arc<AtomicBool>, meet_bridge: MeetBridge) {
    let mut warned = false;
    let mut hold = SpeakerHold::default();
    while !stop.load(Ordering::Relaxed) {
        // Google Meet names come from `meet_bridge` while that extension is live.
        // This loop stays the Zoom/Teams Accessibility writer, and it records an
        // empty set when Meet has no live extension (there is no Meet AX path).
        if !meet_bridge.is_live() {
            match meeting::read_speakers() {
                Ok(names) => {
                    if !meet_bridge.is_live() {
                        let app_running = meeting::running_meeting_app().is_some();
                        if let Some(names) = hold.publish(app_running, names) {
                            sink.record(names, sink.sample_clock_now_ms());
                        }
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
        }
        let slice = Duration::from_millis(10);
        let mut waited = Duration::ZERO;
        while waited < POLL_INTERVAL && !stop.load(Ordering::Relaxed) {
            std::thread::sleep(slice);
            waited += slice;
        }
    }
}

#[derive(Default)]
struct SpeakerHold {
    last: BTreeSet<String>,
    quiet_polls: u32,
    seen_speaker: bool,
}

impl SpeakerHold {
    /// `None` means "do not record this poll". The opening polls of a call
    /// are often empty while Teams is still building its tree; recording
    /// that as nobody makes every later line stay Remote.
    fn publish(
        &mut self,
        app_running: bool,
        observed: BTreeSet<String>,
    ) -> Option<BTreeSet<String>> {
        if !observed.is_empty() {
            self.quiet_polls = 0;
            self.seen_speaker = true;
            self.last = observed.clone();
            return Some(observed);
        }
        if !app_running {
            self.quiet_polls = 0;
            self.seen_speaker = false;
            self.last.clear();
            return Some(observed);
        }
        if self.seen_speaker && self.quiet_polls < HOLD_POLLS {
            self.quiet_polls += 1;
            return Some(self.last.clone());
        }
        if !self.seen_speaker {
            return None;
        }
        self.quiet_polls = 0;
        self.last.clear();
        self.seen_speaker = false;
        Some(observed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_short_gap_keeps_the_last_speaker_and_quitting_clears_it() {
        let mut hold = SpeakerHold::default();
        assert!(hold.publish(true, BTreeSet::new()).is_none());

        let ada = hold.publish(true, BTreeSet::from(["Ada Lovelace".into()]));
        assert_eq!(
            ada.unwrap().into_iter().collect::<Vec<_>>(),
            vec!["Ada Lovelace"]
        );

        for _ in 0..HOLD_POLLS {
            let held = hold.publish(true, BTreeSet::new()).unwrap();
            assert_eq!(held.into_iter().collect::<Vec<_>>(), vec!["Ada Lovelace"]);
        }
        assert!(hold.publish(true, BTreeSet::new()).unwrap().is_empty());

        hold.publish(true, BTreeSet::from(["Ada Lovelace".into()]));
        assert!(hold.publish(false, BTreeSet::new()).unwrap().is_empty());
    }
}
