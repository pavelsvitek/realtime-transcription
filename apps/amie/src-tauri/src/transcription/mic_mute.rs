//! Follows the user's mute button in a meeting app.
//!
//! The mic worker asks this gate for every chunk. While it says muted, the
//! worker feeds silence into the ASR instead of the microphone, so the user's
//! muted speech is never transcribed. The input device itself stays open.

use std::sync::Arc;

/// `true` while the local user is muted in the call they are in.
///
/// A source must fail open: no meeting app, a stale heartbeat, or a failed
/// read all answer `false`. Losing speech is worse than keeping a muted second.
#[derive(Clone)]
pub struct MicMuteGate {
    source: Arc<dyn Fn() -> bool + Send + Sync>,
}

impl MicMuteGate {
    pub fn new(source: impl Fn() -> bool + Send + Sync + 'static) -> Self {
        Self {
            source: Arc::new(source),
        }
    }

    pub fn is_muted(&self) -> bool {
        (self.source)()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, Ordering};

    #[test]
    fn follows_its_source() {
        let flag = Arc::new(AtomicBool::new(false));
        let source = flag.clone();
        let gate = MicMuteGate::new(move || source.load(Ordering::Relaxed));
        assert!(!gate.is_muted());
        flag.store(true, Ordering::Relaxed);
        assert!(gate.is_muted());
    }
}
