use std::error::Error as StdError;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::Value;

use super::provider::{missing_key_message, LlmClient, LlmError, LlmProviderId};

const CHAT_COMPLETIONS_URL: &str = "https://api.x.ai/v1/chat/completions";
const MODEL: &str = "grok-4.6";
/// Lowest effort grok-4.6 accepts. Reasoning cannot be disabled; omitting this
/// defaults to `"high"` and is what made summaries sit in thinking for minutes.
const REASONING_EFFORT: &str = "low";
/// Ceiling for a hung request. With `reasoning_effort=low` completions should
/// return far sooner; xAI still recommends 3600s for this model family.
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
            let api_key = crate::transcription::xai::resolve_api_key().ok_or(
                LlmError::MissingApiKey(missing_key_message(LlmProviderId::Xai)),
            )?;

            let started = Instant::now();
            tracing::info!(
                model = MODEL,
                reasoning_effort = REASONING_EFFORT,
                system_chars = system.len(),
                user_chars = user.len(),
                timeout_secs = TIMEOUT_SECS,
                "xAI summary request starting"
            );

            let response = self
                .http
                .post(CHAT_COMPLETIONS_URL)
                .bearer_auth(api_key)
                .json(&chat_request_body(system, user))
                .send()
                .await
                .map_err(|e| {
                    let error = format_error_chain(&e);
                    tracing::error!(
                        error = %error,
                        elapsed_ms = started.elapsed().as_millis() as u64,
                        "xAI summary request failed"
                    );
                    LlmError::Message(format!("xAI request failed: {error}"))
                })?;

            let status = response.status();
            let text = response.text().await.map_err(|e| {
                let error = format_error_chain(&e);
                tracing::error!(
                    status = %status,
                    error = %error,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    "xAI summary response body failed"
                );
                LlmError::Message(format!("xAI response error: {error}"))
            })?;

            tracing::info!(
                status = %status,
                body_chars = text.len(),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "xAI summary HTTP response"
            );

            if !status.is_success() {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(
                    status = %status,
                    snippet = %snippet,
                    "xAI summary HTTP error"
                );
                return Err(LlmError::Message(format!("xAI HTTP {status}: {snippet}")));
            }

            let value: Value = serde_json::from_str(&text).map_err(|e| {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(
                    error = %e,
                    snippet = %snippet,
                    "xAI summary JSON parse failed"
                );
                LlmError::Message(format!("xAI response JSON error: {e}: {snippet}"))
            })?;
            let content = match completion_text(&value) {
                Ok(content) => content,
                Err(err) => {
                    tracing::error!(error = %err, "xAI summary completion rejected");
                    return Err(err);
                }
            };
            tracing::info!(
                content_chars = content.len(),
                prompt_tokens = usage_u64(&value, "prompt_tokens"),
                completion_tokens = usage_u64(&value, "completion_tokens"),
                reasoning_tokens = reasoning_tokens(&value),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "xAI summary completed"
            );
            on_delta(&content);
            Ok(content)
        })
    }
}

fn chat_request_body(system: &str, user: &str) -> Value {
    serde_json::json!({
        "model": MODEL,
        "stream": false,
        "reasoning_effort": REASONING_EFFORT,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    })
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

fn usage_u64(value: &Value, key: &str) -> Option<u64> {
    value.get("usage")?.get(key)?.as_u64()
}

fn reasoning_tokens(value: &Value) -> Option<u64> {
    let usage = value.get("usage")?;
    usage
        .get("reasoning_tokens")
        .and_then(Value::as_u64)
        .or_else(|| {
            usage
                .get("completion_tokens_details")
                .and_then(|details| details.get("reasoning_tokens"))
                .and_then(Value::as_u64)
        })
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
    fn request_body_sets_minimum_reasoning_effort() {
        let body = chat_request_body("sys", "user");
        assert_eq!(body["model"], MODEL);
        assert_eq!(body["stream"], false);
        assert_eq!(body["reasoning_effort"], "low");
        assert_eq!(REASONING_EFFORT, "low");
    }

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
    fn reads_reasoning_tokens_from_usage() {
        let nested = serde_json::json!({
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "completion_tokens_details": { "reasoning_tokens": 7 }
            }
        });
        assert_eq!(usage_u64(&nested, "prompt_tokens"), Some(10));
        assert_eq!(reasoning_tokens(&nested), Some(7));

        let flat = serde_json::json!({ "usage": { "reasoning_tokens": 3 } });
        assert_eq!(reasoning_tokens(&flat), Some(3));
    }
}
