use std::error::Error as StdError;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::Value;

use super::keys::{model_from, resolve_gemini_api_key};
use super::provider::{missing_key_message, LlmClient, LlmError, LlmProviderId};

const DEFAULT_MODEL: &str = "gemini-2.5-flash";
const TIMEOUT_SECS: u64 = 3600;
const CONNECT_TIMEOUT_SECS: u64 = 30;

pub struct GeminiClient {
    http: Client,
}

impl GeminiClient {
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

impl LlmClient for GeminiClient {
    fn stream_text<'a>(
        &'a self,
        system: &'a str,
        user: &'a str,
        on_delta: &'a (dyn Fn(&str) + Send + Sync),
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<String, LlmError>> + Send + 'a>>
    {
        Box::pin(async move {
            let api_key = resolve_gemini_api_key().ok_or(LlmError::MissingApiKey(
                missing_key_message(LlmProviderId::Gemini),
            ))?;
            let model = summary_model();

            let started = Instant::now();
            tracing::info!(
                model = %model,
                system_chars = system.len(),
                user_chars = user.len(),
                timeout_secs = TIMEOUT_SECS,
                "Gemini summary request starting"
            );

            let response = self
                .http
                .post(generate_content_url(&model))
                .header("x-goog-api-key", api_key)
                .json(&request_body(system, user))
                .send()
                .await
                .map_err(|e| {
                    let error = format_error_chain(&e);
                    tracing::error!(
                        error = %error,
                        elapsed_ms = started.elapsed().as_millis() as u64,
                        "Gemini summary request failed"
                    );
                    LlmError::Message(format!("Gemini request failed: {error}"))
                })?;

            let status = response.status();
            let text = response.text().await.map_err(|e| {
                let error = format_error_chain(&e);
                tracing::error!(
                    status = %status,
                    error = %error,
                    elapsed_ms = started.elapsed().as_millis() as u64,
                    "Gemini summary response body failed"
                );
                LlmError::Message(format!("Gemini response error: {error}"))
            })?;

            tracing::info!(
                status = %status,
                body_chars = text.len(),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "Gemini summary HTTP response"
            );

            if !status.is_success() {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(status = %status, snippet = %snippet, "Gemini summary HTTP error");
                return Err(LlmError::Message(format!(
                    "Gemini HTTP {status}: {snippet}"
                )));
            }

            let value: Value = serde_json::from_str(&text).map_err(|e| {
                let snippet: String = text.chars().take(400).collect();
                tracing::error!(error = %e, snippet = %snippet, "Gemini summary JSON parse failed");
                LlmError::Message(format!("Gemini response JSON error: {e}: {snippet}"))
            })?;
            let content = match completion_text(&value) {
                Ok(content) => content,
                Err(err) => {
                    tracing::error!(error = %err, "Gemini summary completion rejected");
                    return Err(err);
                }
            };
            tracing::info!(
                content_chars = content.len(),
                prompt_tokens = usage_u64(&value, "promptTokenCount"),
                completion_tokens = usage_u64(&value, "candidatesTokenCount"),
                elapsed_ms = started.elapsed().as_millis() as u64,
                "Gemini summary completed"
            );
            on_delta(&content);
            Ok(content)
        })
    }
}

pub(crate) fn summary_model() -> String {
    model_from(
        std::env::var("GEMINI_SUMMARY_MODEL").ok().as_deref(),
        DEFAULT_MODEL,
    )
}

pub(crate) fn generate_content_url(model: &str) -> String {
    format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
}

fn request_body(system: &str, user: &str) -> Value {
    serde_json::json!({
        "systemInstruction": { "parts": [{ "text": system }] },
        "contents": [{
            "role": "user",
            "parts": [{ "text": user }]
        }],
        "generationConfig": {
            "thinkingConfig": { "thinkingBudget": 0 }
        }
    })
}

fn completion_text(value: &Value) -> Result<String, LlmError> {
    if let Some(message) = api_error_message(value) {
        return Err(LlmError::Message(format!("Gemini error: {message}")));
    }
    let parts = value
        .get("candidates")
        .and_then(|candidates| candidates.get(0))
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(Value::as_array);
    let content = parts
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    if content.trim().is_empty() {
        return Err(LlmError::Message(
            "Gemini returned an empty completion.".into(),
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
    value.get("usageMetadata")?.get(key)?.as_u64()
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
    fn request_disables_thinking_and_pins_model_url() {
        let body = request_body("sys", "user");
        assert_eq!(body["systemInstruction"]["parts"][0]["text"], "sys");
        assert_eq!(body["contents"][0]["parts"][0]["text"], "user");
        assert_eq!(
            body["generationConfig"]["thinkingConfig"]["thinkingBudget"],
            0
        );
        assert_eq!(
            generate_content_url(DEFAULT_MODEL),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        );
    }

    #[test]
    fn reads_candidate_text_parts() {
        let value = serde_json::json!({
            "candidates": [{
                "content": {
                    "parts": [
                        { "text": "Title: Hello\n\n" },
                        { "text": "- bullet" }
                    ]
                }
            }]
        });
        assert_eq!(completion_text(&value).unwrap(), "Title: Hello\n\n- bullet");
    }

    #[test]
    fn rejects_empty_completion_and_api_error() {
        let empty = serde_json::json!({
            "candidates": [{ "content": { "parts": [{ "text": "" }] } }]
        });
        assert_eq!(
            completion_text(&empty).unwrap_err().to_string(),
            "Gemini returned an empty completion."
        );
        let err = serde_json::json!({"error": {"message": "API key not valid"}});
        assert_eq!(
            completion_text(&err).unwrap_err().to_string(),
            "Gemini error: API key not valid"
        );
    }
}
