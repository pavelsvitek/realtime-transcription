use std::error::Error as StdError;
use std::time::Duration;

use reqwest::Client;
use serde_json::Value;

use super::provider::{LlmClient, LlmError};

const CHAT_COMPLETIONS_URL: &str = "https://api.x.ai/v1/chat/completions";
const MODEL: &str = "grok-4.6";
/// grok-4.6 can spend several minutes reasoning before `message.content`
/// is ready. xAI's own clients use 3600s; a short deadline shows up as
/// reqwest's "error decoding response body".
const TIMEOUT_SECS: u64 = 3600;
const CONNECT_TIMEOUT_SECS: u64 = 30;

pub struct XaiChatClient {
    http: Client,
}

impl XaiChatClient {
    pub fn new() -> Self {
        let http = Client::builder()
            .http1_only()
            .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(TIMEOUT_SECS))
            .build()
            .expect("reqwest client");
        Self { http }
    }
}

impl LlmClient for XaiChatClient {
    fn stream_text<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
        on_delta: &'a (dyn Fn(&str) + Send + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, LlmError>> + Send + 'a>>
    {
        Box::pin(async move {
            let api_key =
                crate::transcription::xai::resolve_api_key().ok_or(LlmError::MissingApiKey)?;

            let body = serde_json::json!({
                "model": MODEL,
                "stream": false,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ]
            });

            let response = self
                .http
                .post(CHAT_COMPLETIONS_URL)
                .bearer_auth(api_key)
                .json(&body)
                .send()
                .await
                .map_err(|e| {
                    LlmError::Message(format!("xAI request failed: {}", format_error_chain(&e)))
                })?;

            let status = response.status();
            let text = response.text().await.map_err(|e| {
                LlmError::Message(format!("xAI response error: {}", format_error_chain(&e)))
            })?;

            if !status.is_success() {
                let snippet: String = text.chars().take(400).collect();
                return Err(LlmError::Message(format!("xAI HTTP {status}: {snippet}")));
            }

            let value: Value = serde_json::from_str(&text).map_err(|e| {
                let snippet: String = text.chars().take(400).collect();
                LlmError::Message(format!("xAI response JSON error: {e}: {snippet}"))
            })?;
            let content = completion_text(&value)?;
            on_delta(&content);
            Ok(content)
        })
    }
}

fn completion_text(value: &Value) -> Result<String, LlmError> {
    if let Some(message) = api_error_message(value) {
        return Err(LlmError::Message(format!("xAI error: {message}")));
    }
    let content = value
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if content.trim().is_empty() {
        return Err(LlmError::Message(
            "xAI returned an empty completion.".into(),
        ));
    }
    Ok(content)
}

fn api_error_message(value: &Value) -> Option<String> {
    let err = value.get("error")?;
    if let Some(msg) = err.as_str() {
        let msg = msg.trim();
        return (!msg.is_empty()).then(|| msg.to_string());
    }
    let msg = err.get("message")?.as_str()?.trim();
    (!msg.is_empty()).then(|| msg.to_string())
}

fn format_error_chain(err: &dyn StdError) -> String {
    let mut parts = vec![err.to_string()];
    let mut source = err.source();
    while let Some(inner) = source {
        let text = inner.to_string();
        if !parts.iter().any(|part| part.contains(&text)) {
            parts.push(text);
        }
        source = inner.source();
    }
    parts.join(": ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_message_content() {
        let value = serde_json::json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "Title: Hello\n\n- **Pavel** spoke"
                }
            }]
        });
        assert_eq!(
            completion_text(&value).unwrap(),
            "Title: Hello\n\n- **Pavel** spoke"
        );
    }

    #[test]
    fn ignores_reasoning_only_payloads() {
        let value = serde_json::json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "reasoning_content": "thinking",
                    "content": ""
                }
            }]
        });
        assert_eq!(
            completion_text(&value).unwrap_err().to_string(),
            "xAI returned an empty completion."
        );
    }

    #[test]
    fn surfaces_api_error_object() {
        let value = serde_json::json!({"error": {"message": "model overloaded"}});
        assert_eq!(
            completion_text(&value).unwrap_err().to_string(),
            "xAI error: model overloaded"
        );
    }

    #[test]
    fn reasoning_model_timeout_matches_xai_docs() {
        assert_eq!(TIMEOUT_SECS, 3600);
        assert_eq!(CONNECT_TIMEOUT_SECS, 30);
    }
}
