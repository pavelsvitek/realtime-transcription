use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use super::gemini::GeminiClient;
use super::openai::OpenaiChatClient;
use super::xai::XaiChatClient;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LlmProviderId {
    Xai,
    Openai,
    Gemini,
}

impl LlmProviderId {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "xai" => Some(Self::Xai),
            "openai" => Some(Self::Openai),
            "gemini" => Some(Self::Gemini),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Xai => "xai",
            Self::Openai => "openai",
            Self::Gemini => "gemini",
        }
    }
}

pub const fn missing_key_message(id: LlmProviderId) -> &'static str {
    match id {
        LlmProviderId::Xai => "xAI API key is not set. Add one in Settings.",
        LlmProviderId::Openai => "OpenAI API key is not set. Add one in Settings.",
        LlmProviderId::Gemini => "Gemini API key is not set. Add one in Settings.",
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LlmError {
    #[error("{0}")]
    Message(String),
    #[error("{0}")]
    MissingApiKey(&'static str),
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
        LlmProviderId::Openai => Ok(Arc::new(OpenaiChatClient::new())),
        LlmProviderId::Gemini => Ok(Arc::new(GeminiClient::new())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_builds_each_provider() {
        assert!(create_client(LlmProviderId::Xai).is_ok());
        assert!(create_client(LlmProviderId::Openai).is_ok());
        assert!(create_client(LlmProviderId::Gemini).is_ok());
    }

    #[test]
    fn missing_key_messages_name_the_provider() {
        assert_eq!(
            missing_key_message(LlmProviderId::Openai),
            "OpenAI API key is not set. Add one in Settings."
        );
        assert_eq!(
            missing_key_message(LlmProviderId::Gemini),
            "Gemini API key is not set. Add one in Settings."
        );
    }
}
