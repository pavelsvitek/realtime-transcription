use std::collections::BTreeSet;

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
/// returns a name only when that single remote speaker covers the whole range.
#[derive(Debug, Default, Clone)]
pub struct SpeakerTimeline {
    polls: Vec<(u64, BTreeSet<String>)>,
}

impl SpeakerTimeline {
    pub fn new() -> Self {
        Self { polls: Vec::new() }
    }

    pub fn push<I, S>(&mut self, at_ms: u64, speakers: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        let set: BTreeSet<String> = speakers.into_iter().map(Into::into).collect();
        if self.polls.last().is_some_and(|(_, last)| last == &set) {
            return;
        }
        self.polls.push((at_ms, set));
    }

    pub fn poll_count(&self) -> usize {
        self.polls.len()
    }

    pub fn resolve(&self, start_ms: u64, end_ms: u64) -> Option<String> {
        if self.polls.is_empty() || end_ms < start_ms {
            return None;
        }
        let range_end = end_ms.max(start_ms.saturating_add(1));
        if start_ms < self.polls[0].0 {
            return None;
        }

        let mut only: Option<String> = None;
        let mut cursor = start_ms;
        for (index, (at, set)) in self.polls.iter().enumerate() {
            let next = self
                .polls
                .get(index + 1)
                .map(|(time, _)| *time)
                .unwrap_or(u64::MAX);
            if next <= start_ms || *at >= range_end {
                continue;
            }
            let name = single_name(set)?;
            match &only {
                None => only = Some(name.to_string()),
                Some(existing) if existing != name => return None,
                Some(_) => {}
            }
            let cover_from = (*at).max(start_ms);
            if cover_from > cursor {
                return None;
            }
            cursor = cursor.max(next.min(range_end));
        }
        if cursor < range_end {
            return None;
        }
        only
    }
}

fn single_name(set: &BTreeSet<String>) -> Option<&str> {
    if set.len() != 1 {
        return None;
    }
    set.iter().next().map(String::as_str)
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
    fn overlap_gap_and_local_user_stay_unresolved() {
        let mut overlap = SpeakerTimeline::new();
        overlap.push(0, ["Ada Lovelace", "Bob"]);
        assert!(overlap.resolve(0, 500).is_none());

        let mut gap = SpeakerTimeline::new();
        gap.push(1_000, ["Ada Lovelace"]);
        assert!(gap.resolve(0, 500).is_none());

        let mut nobody = SpeakerTimeline::new();
        nobody.push(0, Vec::<String>::new());
        assert!(nobody.resolve(0, 500).is_none());
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
        assert!(timeline.resolve(0, 2_500).is_none());
        assert_eq!(timeline.resolve(2_000, 3_000).as_deref(), Some("Bob"));
    }
}
