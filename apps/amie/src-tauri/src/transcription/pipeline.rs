use anyhow::Result;

#[derive(Debug, Clone)]
pub struct AsrWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Default)]
pub struct AsrOutput {
    pub committed: Vec<AsrWord>,
    pub tentative: Vec<AsrWord>,
}

impl AsrOutput {
    pub fn is_empty(&self) -> bool {
        self.committed.is_empty() && self.tentative.is_empty()
    }
}

/// Backend-agnostic streaming ASR interface used by the transcription worker.
pub trait StreamingAsr: Send {
    fn push_mono(&mut self, samples: &[f32]) -> Result<Option<AsrOutput>>;
    fn finish(&mut self) -> Result<AsrOutput>;

    /// Finalize the in-flight utterance without ending the session.
    ///
    /// Used when the remote speaker set changes. Backends that cannot cut
    /// client-side return no output.
    fn cut_utterance(&mut self) -> Result<Option<AsrOutput>> {
        Ok(None)
    }
}

pub struct StreamingPipeline {
    inner: Box<dyn StreamingAsr>,
}

impl StreamingPipeline {
    pub fn new(inner: Box<dyn StreamingAsr>) -> Self {
        Self { inner }
    }

    pub fn push_mono(&mut self, samples: &[f32]) -> Result<Option<AsrOutput>> {
        self.inner.push_mono(samples)
    }

    pub fn finish(&mut self) -> Result<AsrOutput> {
        self.inner.finish()
    }

    pub fn cut_utterance(&mut self) -> Result<Option<AsrOutput>> {
        self.inner.cut_utterance()
    }
}
