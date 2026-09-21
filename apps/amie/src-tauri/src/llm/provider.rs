use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use super::xai::XaiChatClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmProviderId {
    Xai,
    Openai,
    Gemini,
}

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("{0}")]
    Message(String),
    #[error("{0} is not implemented")]
    Unsupported(&'static str),
    #[error("xAI API key is not set. Add one in Settings.")]
    MissingApiKey,
}

pub trait LlmClient: Send + Sync {
    fn stream_text<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
        on_delta: &'a (dyn Fn(&str) + Send + Sync),
    ) -> Pin<Box<dyn Future<Output = Result<String, LlmError>> + Send + 'a>>;
}

pub fn create_client(id: LlmProviderId) -> Result<Arc<dyn LlmClient>, LlmError> {
    match id {
        LlmProviderId::Xai => Ok(Arc::new(XaiChatClient::new())),
        LlmProviderId::Openai => Err(LlmError::Unsupported("openai")),
        LlmProviderId::Gemini => Err(LlmError::Unsupported("gemini")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_rejects_openai_and_gemini() {
        match create_client(LlmProviderId::Openai) {
            Err(LlmError::Unsupported(name)) => assert_eq!(name, "openai"),
            Ok(_) => panic!("expected unsupported openai"),
            Err(e) => panic!("expected unsupported openai, got {e}"),
        }
        match create_client(LlmProviderId::Gemini) {
            Err(LlmError::Unsupported(name)) => assert_eq!(name, "gemini"),
            Ok(_) => panic!("expected unsupported gemini"),
            Err(e) => panic!("expected unsupported gemini, got {e}"),
        }
    }

    #[test]
    fn factory_builds_xai_client() {
        assert!(create_client(LlmProviderId::Xai).is_ok());
    }
}
