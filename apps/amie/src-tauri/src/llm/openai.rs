use std::error::Error as StdError;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::Value;

use super::keys::{model_from, resolve_openai_api_key};
use super::provider::{missing_key_message, LlmClient, LlmError, LlmProviderId};

const CHAT_COMPLETIONS_URL: &str = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL: &str = "gpt-4.1-mini";
const TIMEOUT_SECS: u64 = 3600;
const CONNECT_TIMEOUT_SECS: u64 = 30;

pub struct OpenaiChatClient {
    http: Client,
}

impl OpenaiChatClient {
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

impl LlmClient for OpenaiChatClient {
    fn stream_text<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
        on_delta: &'a (dyn Fn(&str) + Send + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, LlmError>> + Send + 'a>>
    {
        Box::pin(async move {
            let api_key = resolve_openai_api_key().ok_or(LlmError::MissingApiKey(
                missing_key_message(LlmProviderId::Openai),
            ))?;
            let model = summary_model();

            let started = Instant::now();
            tracing::info!(
                model = %model,
                system_chars = system.len(),
                user_chars = user.len(),
                timeout_secs = TIMEOUT_SECS,
                "OpenAI summary request starting"
            );

            let response = self
                .http
                .post(CHAT_COMPLETIONS_URL)
                .bearer_auth(api_key)
                .json(&chat_request_body(&model, system, user))
                .send()
                .await
                .map_err(|e| {
                    let error = format_error_chain(&e);
                    tracing::error!(
                        error = %error,
                        elapsed_ms = started.elapsed().as_millis() as u64,
                        "OpenAI summary request failed"
                    );
                    LlmError::Message(format!("OpenAI request failed: {error}"))
                })?;

            let status = response.status();
            let text = response.text().await.map_err(|e| {
                let error = format_error_chain(&e);
                tracing::error!(
                    status = %status,
                    error = %error,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    "OpenAI summary response body failed"
                );
                LlmError::Message(format!("OpenAI response error: {error}"))
            })?;

            tracing::info!(
                status = %status,
                body_chars = text.len(),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "OpenAI summary HTTP response"
            );

            if !status.is_success() {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(status = %status, snippet = %snippet, "OpenAI summary HTTP error");
                return Err(LlmError::Message(format!(
                    "OpenAI HTTP {status}: {snippet}"
                )));
            }

            let value: Value = serde_json::from_str(&text).map_err(|e| {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(error = %e, snippet = %snippet, "OpenAI summary JSON parse failed");
                LlmError::Message(format!("OpenAI response JSON error: {e}: {snippet}"))
            })?;
            let content = match completion_text(&value) {
                Ok(content) => content,
                Err(err) => {
                    tracing::error!(error = %err, "OpenAI summary completion rejected");
                    return Err(err);
                }
            };
            tracing::info!(
                content_chars = content.len(),
                prompt_tokens = usage_u64(&value, "prompt_tokens"),
                completion_tokens = usage_u64(&value, "completion_tokens"),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "OpenAI summary completed"
            );
            on_delta(&content);
            Ok(content)
        })
    }
}

pub(crate) fn summary_model() -> String {
    model_from(
        std::env::var("OPENAI_SUMMARY_MODEL").ok().as_deref(),
        DEFAULT_MODEL,
    )
}

fn chat_request_body(model: &str, system: &str, user: &str) -> Value {
    serde_json::json!({
        "model": model,
        "stream": false,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
    })
}

fn completion_text(value: &Value) -> Result<String, LlmError> {
    if let Some(message) = api_error_message(value) {
        return Err(LlmError::Message(format!("OpenAI error: {message}")));
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
            "OpenAI returned an empty completion.".into(),
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
    fn request_body_is_non_streaming_chat() {
        let body = chat_request_body("gpt-4.1-mini", "sys", "user");
        assert_eq!(body["model"], "gpt-4.1-mini");
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"][0]["role"], "system");
        assert_eq!(body["messages"][0]["content"], "sys");
        assert_eq!(body["messages"][1]["content"], "user");
    }

    #[test]
    fn model_override_falls_back_when_blank_or_unsafe() {
        assert_eq!(model_from(None, DEFAULT_MODEL), DEFAULT_MODEL);
        assert_eq!(model_from(Some("  "), DEFAULT_MODEL), DEFAULT_MODEL);
        assert_eq!(model_from(Some("../evil"), DEFAULT_MODEL), DEFAULT_MODEL);
        assert_eq!(model_from(Some("gpt-4.1"), DEFAULT_MODEL), "gpt-4.1");
    }

    #[test]
    fn reads_message_content() {
        let value = serde_json::json!({
            "choices": [{
                "message": { "role": "assistant", "content": "Title: Hello\n\n- bullet" }
            }]
        });
        assert_eq!(completion_text(&value).unwrap(), "Title: Hello\n\n- bullet");
    }

    #[test]
    fn rejects_empty_completion_and_api_error() {
        let empty = serde_json::json!({
            "choices": [{ "message": { "content": "  " } }]
        });
        assert_eq!(
            completion_text(&empty).unwrap_err().to_string(),
            "OpenAI returned an empty completion."
        );
        let err = serde_json::json!({"error": {"message": "invalid api key"}});
        assert_eq!(
            completion_text(&err).unwrap_err().to_string(),
            "OpenAI error: invalid api key"
        );
    }
}
