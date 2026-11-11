//! Records a remote-speaker set onto the system-audio timeline.
//!
//! Google Meet names arrive from `speakers::meet_bridge`. Zoom and Teams
//! names arrive from the Accessibility poll. Both call `SpeakerSink::record`.

use std::collections::BTreeSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use super::timeline::{samples_to_ms, SpeakerTimeline};

/// One writer into a session's [`SpeakerTimeline`].
#[derive(Clone)]
pub struct SpeakerSink {
    timeline: Arc<Mutex<SpeakerTimeline>>,
    captured_samples: Arc<AtomicU64>,
    sample_rate: u32,
    speaker_cut: Arc<AtomicU64>,
}

impl SpeakerSink {
    pub fn new(
        timeline: Arc<Mutex<SpeakerTimeline>>,
        captured_samples: Arc<AtomicU64>,
        sample_rate: u32,
        speaker_cut: Arc<AtomicU64>,
    ) -> Self {
        Self {
            timeline,
            captured_samples,
            sample_rate,
            speaker_cut,
        }
    }

    pub fn sample_clock_now_ms(&self) -> u64 {
        samples_to_ms(
            self.captured_samples.load(Ordering::Relaxed),
            self.sample_rate,
        )
    }

    /// `at_ms` is on the system-audio sample clock. A non-empty change bumps
    /// `speaker_cut` so the caption worker can split the segment.
    pub fn record(&self, names: BTreeSet<String>, at_ms: u64) {
        let changed = self
            .timeline
            .lock()
            .map(|mut timeline| timeline.push(at_ms, names.iter().cloned()))
            .unwrap_or(false);
        if changed && !names.is_empty() {
            self.speaker_cut.fetch_add(1, Ordering::Release);
        }
    }
}
