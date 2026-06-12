use crate::transcription::TranscriptionService;

pub struct TranscriptionHandle {
    pub service: TranscriptionService,
}

impl Default for TranscriptionHandle {
    fn default() -> Self {
        Self {
            service: TranscriptionService::new(),
        }
    }
}
