use std::collections::{BTreeSet, HashMap};

/// Convert a capture sample count into milliseconds on that stream's clock.
pub fn samples_to_ms(samples: u64, sample_rate: u32) -> u64 {
    if sample_rate == 0 {
        return 0;
    }
    let ms = u128::from(samples).saturating_mul(1_000) / u128::from(sample_rate);
    u64::try_from(ms).unwrap_or(u64::MAX)
}

/// Polls of who is speaking, stamped on the system-audio sample clock.
///
/// Consecutive polls with the same set collapse into one interval. `resolve`
/// returns the speaker set that covers the most of the range. Simultaneous
/// names are joined with `"; "` in sorted order so a comma inside a name
/// (e.g. `Richardson, Bob`) is not a speaker boundary. Ties keep the set
/// that starts earlier.
#[derive(Debug, Default, Clone)]
pub struct SpeakerTimeline {
    polls: Vec<(u64, BTreeSet<String>)>,
}

impl SpeakerTimeline {
    pub fn new() -> Self {
        Self { polls: Vec::new() }
    }

    pub fn push<I, S>(&mut self, at_ms: u64, speakers: I) -> bool
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let set: BTreeSet<String> = speakers.into_iter().map(Into::into).collect();
        if self.polls.last().is_some_and(|(_, last)| last == &set) {
            return false;
        }
        self.polls.push((at_ms, set));
        true
    }

    pub fn poll_count(&self) -> usize {
        self.polls.len()
    }

    pub fn resolve(&self, start_ms: u64, end_ms: u64) -> Option<String> {
        if self.polls.is_empty() || end_ms < start_ms {
            return None;
        }
        let range_end = end_ms.max(start_ms.saturating_add(1));
        let first = self.polls[0].0;
        // Capture starts before the first accessibility poll. Speech that
        // begins in that prefix still uses the speaker who covers the rest.
        let start_ms = if start_ms < first {
            if range_end <= first {
                return None;
            }
            first
        } else {
            start_ms
        };

        score_range(&self.polls, start_ms, range_end)
    }
}

struct Coverage {
    duration: u64,
    earliest: u64,
}

fn score_range(polls: &[(u64, BTreeSet<String>)], start_ms: u64, range_end: u64) -> Option<String> {
    let mut scores: HashMap<String, Coverage> = HashMap::new();
    for (index, (at, set)) in polls.iter().enumerate() {
        let next = polls
            .get(index + 1)
            .map(|(time, _)| *time)
            .unwrap_or(u64::MAX);
        if next <= start_ms || *at >= range_end {
            continue;
        }
        let Some(label) = format_speakers(set) else {
            continue;
        };
        let cover_from = (*at).max(start_ms);
        let cover_to = next.min(range_end);
        if cover_to <= cover_from {
            continue;
        }
        let entry = scores.entry(label).or_insert(Coverage {
            duration: 0,
            earliest: cover_from,
        });
        entry.duration += cover_to - cover_from;
        entry.earliest = entry.earliest.min(cover_from);
    }
    scores
        .into_iter()
        .max_by(|left, right| {
            left.1
                .duration
                .cmp(&right.1.duration)
                .then(right.1.earliest.cmp(&left.1.earliest))
        })
        .map(|(label, _)| label)
}

fn format_speakers(set: &BTreeSet<String>) -> Option<String> {
    if set.is_empty() {
        return None;
    }
    Some(set.iter().cloned().collect::<Vec<_>>().join("; "))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capture_samples_are_the_clock() {
        assert_eq!(samples_to_ms(48_000, 48_000), 1_000);
        assert_eq!(samples_to_ms(16_000, 16_000), 1_000);
        assert_eq!(samples_to_ms(0, 48_000), 0);
    }

    #[test]
    fn one_remote_name_covers_the_range() {
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, ["Ada Lovelace"]);
        assert_eq!(timeline.resolve(100, 800).as_deref(), Some("Ada Lovelace"));
    }

    #[test]
    fn overlap_is_joined_and_a_gap_or_nobody_stays_unresolved() {
        let mut overlap = SpeakerTimeline::new();
        overlap.push(0, ["Ada Lovelace", "Bob"]);
        assert_eq!(
            overlap.resolve(0, 500).as_deref(),
            Some("Ada Lovelace; Bob")
        );

        let mut last_first = SpeakerTimeline::new();
        last_first.push(0, ["Richardson, Bob", "Ada Lovelace"]);
        assert_eq!(
            last_first.resolve(0, 500).as_deref(),
            Some("Ada Lovelace; Richardson, Bob")
        );

        let mut gap = SpeakerTimeline::new();
        gap.push(1_000, ["Ada Lovelace"]);
        assert!(gap.resolve(0, 500).is_none());

        let mut nobody = SpeakerTimeline::new();
        nobody.push(0, Vec::<String>::new());
        assert!(nobody.resolve(0, 500).is_none());
    }

    #[test]
    fn a_later_speaker_does_not_steal_a_range_they_barely_overlap() {
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, ["Ada Lovelace"]);
        timeline.push(1_900, ["Bob"]);
        assert_eq!(timeline.resolve(0, 2_000).as_deref(), Some("Ada Lovelace"));
        assert_eq!(timeline.resolve(1_900, 2_500).as_deref(), Some("Bob"));
    }

    #[test]
    fn an_equal_split_keeps_the_speaker_who_started_the_range() {
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, ["Bob"]);
        timeline.push(500, ["Ada Lovelace"]);
        assert_eq!(timeline.resolve(0, 1_000).as_deref(), Some("Bob"));
    }

    #[test]
    fn consecutive_identical_polls_collapse() {
        let mut timeline = SpeakerTimeline::new();
        timeline.push(0, ["Ada Lovelace"]);
        timeline.push(250, ["Ada Lovelace"]);
        timeline.push(500, ["Ada Lovelace"]);
        assert_eq!(timeline.poll_count(), 1);
        assert_eq!(timeline.resolve(0, 2_000).as_deref(), Some("Ada Lovelace"));

        timeline.push(2_000, ["Bob"]);
        assert_eq!(timeline.poll_count(), 2);
        assert_eq!(timeline.resolve(0, 2_500).as_deref(), Some("Ada Lovelace"));
        assert_eq!(timeline.resolve(2_000, 3_000).as_deref(), Some("Bob"));
    }

    #[test]
    fn speech_that_starts_before_the_first_poll_keeps_the_covering_name() {
        let mut timeline = SpeakerTimeline::new();
        timeline.push(200, ["Ada Lovelace"]);
        assert_eq!(timeline.resolve(0, 2_000).as_deref(), Some("Ada Lovelace"));
    }
}
