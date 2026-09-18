use crate::meetings::MeetingStore;
use crate::transcription::TranscriptionService;

pub struct TranscriptionHandle {
    pub service: TranscriptionService,
}

impl TranscriptionHandle {
    pub fn new(store: MeetingStore) -> Self {
        Self {
            service: TranscriptionService::with_store(store),
        }
    }
}
