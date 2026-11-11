use crate::llm::SummaryService;
use crate::meetings::MeetingStore;
use crate::speakers::MeetBridge;
use crate::transcription::TranscriptionService;

pub struct TranscriptionHandle {
    pub service: TranscriptionService,
}

impl TranscriptionHandle {
    pub fn new(store: MeetingStore, summaries: SummaryService, meet_bridge: MeetBridge) -> Self {
        Self {
            service: TranscriptionService::with_store(store)
                .with_summaries(summaries)
                .with_meet_bridge(meet_bridge),
        }
    }
}
