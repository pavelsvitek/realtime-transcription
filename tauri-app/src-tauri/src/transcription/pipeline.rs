use yamabiko_whisper::{AsrPipeline as WhisperPipeline, Word};

use super::canary::CanaryEngine;

#[derive(Debug, Clone)]
pub struct AsrWord {
    pub text: String,
    pub start: f64,
    pub end: f64,
}

impl From<&Word> for AsrWord {
    fn from(word: &Word) -> Self {
        Self {
            text: word.text.clone(),
            start: word.start,
            end: word.end,
        }
    }
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

pub enum StreamingPipeline {
    Whisper(WhisperPipeline),
    Canary(CanaryEngine),
}

impl StreamingPipeline {
    pub fn push_mono(&mut self, samples: &[f32]) -> anyhow::Result<Option<AsrOutput>> {
        match self {
            Self::Whisper(pipeline) => {
                let output = pipeline.push_mono(samples)?;
                Ok(output.map(|out| AsrOutput {
                    committed: out.committed.iter().map(AsrWord::from).collect(),
                    tentative: out.tentative.iter().map(AsrWord::from).collect(),
                }))
            }
            Self::Canary(engine) => engine.push_mono(samples),
        }
    }

    pub fn finish(&mut self) -> anyhow::Result<AsrOutput> {
        match self {
            Self::Whisper(pipeline) => {
                let output = pipeline.finish()?;
                Ok(AsrOutput {
                    committed: output.committed.iter().map(AsrWord::from).collect(),
                    tentative: output.tentative.iter().map(AsrWord::from).collect(),
                })
            }
            Self::Canary(engine) => engine.finish(),
        }
    }
}
