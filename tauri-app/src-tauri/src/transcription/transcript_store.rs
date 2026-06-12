use std::sync::{Arc, Mutex};

/// Accumulates committed transcript text for export and golden tests.
#[derive(Clone, Default)]
pub struct TranscriptStore {
    inner: Arc<Mutex<String>>,
}

impl TranscriptStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn clear(&self) {
        self.inner.lock().unwrap().clear();
    }

    pub fn append_commit(&self, text: &str) {
        if text.is_empty() {
            return;
        }
        let mut guard = self.inner.lock().unwrap();
        if !guard.is_empty() {
            guard.push(' ');
        }
        guard.push_str(text);
    }

    pub fn text(&self) -> String {
        self.inner.lock().unwrap().clone()
    }
}
