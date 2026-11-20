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
    /// Speakers at the last cut. Shared by clones so every writer agrees.
    cut_anchor: Arc<Mutex<BTreeSet<String>>>,
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
            cut_anchor: Arc::new(Mutex::new(BTreeSet::new())),
        }
    }

    pub fn sample_clock_now_ms(&self) -> u64 {
        samples_to_ms(
            self.captured_samples.load(Ordering::Relaxed),
            self.sample_rate,
        )
    }

    /// `at_ms` is on the system-audio sample clock. A handover to new
    /// speakers bumps `speaker_cut` so the caption worker can split the segment.
    pub fn record(&self, names: BTreeSet<String>, at_ms: u64) {
        let changed = self
            .timeline
            .lock()
            .map(|mut timeline| timeline.push(at_ms, names.iter().cloned()))
            .unwrap_or(false);
        if !changed {
            return;
        }
        let handover = self
            .cut_anchor
            .lock()
            .map(|mut anchor| take_handover(&mut anchor, &names))
            .unwrap_or(false);
        if handover {
            self.speaker_cut.fetch_add(1, Ordering::Release);
        }
    }
}

/// Whether `names` hands the floor to new speakers since the last cut.
///
/// Every cut finalizes the ASR utterance, so words around it can be lost.
/// The speaking meters flicker: a pause drops a speaker for a moment, and a
/// "mhm" adds a second one. Those keep someone from the last cut speaking,
/// so they are not a handover. Only a set with nobody from the last cut is.
fn take_handover(anchor: &mut BTreeSet<String>, names: &BTreeSet<String>) -> bool {
    if names.is_empty() || !anchor.is_disjoint(names) {
        return false;
    }
    *anchor = names.clone();
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(names: &[&str]) -> BTreeSet<String> {
        names.iter().map(|name| name.to_string()).collect()
    }

    fn cuts(sequence: &[&[&str]]) -> usize {
        let sink = SpeakerSink::new(
            Arc::new(Mutex::new(SpeakerTimeline::new())),
            Arc::new(AtomicU64::new(0)),
            48_000,
            Arc::new(AtomicU64::new(0)),
        );
        for (index, names) in sequence.iter().enumerate() {
            sink.record(set(names), index as u64 * 1_000);
        }
        sink.speaker_cut.load(Ordering::Relaxed) as usize
    }

    #[test]
    fn the_first_speaker_cuts() {
        assert_eq!(cuts(&[&["Ada"]]), 1);
    }

    #[test]
    fn a_pause_in_one_speaker_does_not_cut() {
        assert_eq!(cuts(&[&["Ada"], &[], &["Ada"], &[], &["Ada"]]), 1);
    }

    #[test]
    fn a_second_voice_joining_and_leaving_does_not_cut() {
        assert_eq!(cuts(&[&["Ada"], &["Ada", "Bob"], &["Ada"]]), 1);
    }

    #[test]
    fn a_new_speaker_cuts() {
        assert_eq!(cuts(&[&["Ada"], &["Bob"]]), 2);
        assert_eq!(cuts(&[&["Ada"], &[], &["Bob"]]), 2);
    }

    #[test]
    fn a_handover_through_overlap_cuts_once() {
        assert_eq!(cuts(&[&["Ada"], &["Ada", "Bob"], &["Bob"], &["Bob", "Ada"]]), 2);
    }

    #[test]
    fn writers_share_the_last_cut() {
        let sink = SpeakerSink::new(
            Arc::new(Mutex::new(SpeakerTimeline::new())),
            Arc::new(AtomicU64::new(0)),
            48_000,
            Arc::new(AtomicU64::new(0)),
        );
        let other = sink.clone();
        sink.record(set(&["Ada"]), 0);
        other.record(set(&[]), 1_000);
        other.record(set(&["Ada"]), 2_000);
        assert_eq!(sink.speaker_cut.load(Ordering::Relaxed), 1);
    }
}
