//! The local user's mute state in a Zoom or Teams call, read from Accessibility.
//!
//! The speaker watch writes it on every poll. The mic gate reads it for every
//! audio chunk, so a read is one short lock. Like the Google Meet bridge, it
//! fails open: a missing or old reading means "not muted".

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// A reading older than this is ignored. A poll is 250 ms plus the time to walk
/// the tree, so this tolerates a few slow reads without trusting a dead watch.
const STALE_AFTER: Duration = Duration::from_millis(3_000);

#[derive(Clone, Default)]
pub struct AppMute {
    last: Arc<Mutex<Option<(bool, Instant)>>>,
}

impl AppMute {
    /// `None` means the app did not say (no call, tree closed, read failed).
    pub fn set(&self, muted: Option<bool>) {
        self.set_at(muted, Instant::now());
    }

    pub fn is_muted(&self) -> bool {
        self.is_muted_at(Instant::now())
    }

    fn set_at(&self, muted: Option<bool>, now: Instant) {
        if let Ok(mut last) = self.last.lock() {
            *last = muted.map(|muted| (muted, now));
        }
    }

    fn is_muted_at(&self, now: Instant) -> bool {
        self.last
            .lock()
            .ok()
            .and_then(|last| *last)
            .is_some_and(|(muted, at)| muted && now.saturating_duration_since(at) <= STALE_AFTER)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_is_not_muted() {
        let mute = AppMute::default();
        assert!(!mute.is_muted());
        mute.set(None);
        assert!(!mute.is_muted());
    }

    #[test]
    fn follows_the_latest_reading() {
        let mute = AppMute::default();
        let t0 = Instant::now();
        mute.set_at(Some(true), t0);
        assert!(mute.is_muted_at(t0));
        mute.set_at(Some(false), t0);
        assert!(!mute.is_muted_at(t0));
        mute.set_at(Some(true), t0);
        mute.set_at(None, t0);
        assert!(!mute.is_muted_at(t0), "an unreadable poll releases the mute");
    }

    #[test]
    fn a_stale_reading_fails_open() {
        let mute = AppMute::default();
        let t0 = Instant::now();
        mute.set_at(Some(true), t0);
        assert!(mute.is_muted_at(t0 + STALE_AFTER));
        assert!(!mute.is_muted_at(t0 + STALE_AFTER + Duration::from_millis(1)));
    }

    #[test]
    fn clones_share_one_reading() {
        let writer = AppMute::default();
        let reader = writer.clone();
        writer.set(Some(true));
        assert!(reader.is_muted());
    }
}
