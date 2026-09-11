use super::nemotron::NemotronPipeline;

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

pub struct StreamingPipeline {
    helper: NemotronPipeline,
}

impl StreamingPipeline {
    pub fn new(helper: NemotronPipeline) -> Self {
        Self { helper }
    }

    pub fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
        self.helper.push_mono(samples)
    }

    pub fn finish(&mut self) -> anyhow::Result<AsrOutput> {
        self.helper.finish()
    }
}
