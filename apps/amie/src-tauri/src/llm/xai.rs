use std::time::Duration;

use futures_util::StreamExt;
use reqwest::Client;

use super::provider::{LlmClient, LlmError};
use super::sse::{delta_content, SseItem, SseParser};

const CHAT_COMPLETIONS_URL: &str = "https://api.x.ai/v1/chat/completions";
const MODEL: &str = "grok-4.6";
const TIMEOUT_SECS: u64 = 180;

pub struct XaiChatClient {
    http: Client,
}

impl XaiChatClient {
    pub fn new() -> Self {
        let http = Client::builder()
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
            let api_key = crate::transcription::xai::resolve_api_key()
                .ok_or(LlmError::MissingApiKey)?;

            let body = serde_json::json!({
                "model": MODEL,
                "stream": true,
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
                .map_err(|e| LlmError::Message(format!("xAI request failed: {e}")))?;

            if !response.status().is_success() {
                let status = response.status();
                let text = response.text().await.unwrap_or_default();
                let snippet: String = text.chars().take(400).collect();
                return Err(LlmError::Message(format!("xAI HTTP {status}: {snippet}")));
            }

            let mut stream = response.bytes_stream();
            let mut parser = SseParser::new();
            let mut accumulated = String::new();

            while let Some(chunk) = stream.next().await {
                let bytes = chunk
                    .map_err(|e| LlmError::Message(format!("xAI stream error: {e}")))?;
                let text = String::from_utf8_lossy(&bytes);
                if apply_sse_items(&mut accumulated, parser.push(&text), on_delta) {
                    return Ok(accumulated);
                }
            }
            apply_sse_items(&mut accumulated, parser.finish(), on_delta);
            Ok(accumulated)
        })
    }
}

fn apply_sse_items(
    accumulated: &mut String,
    items: Vec<SseItem>,
    on_delta: &(dyn Fn(&str) + Send + Sync),
) -> bool {
    for item in items {
        match item {
            SseItem::Done => return true,
            SseItem::Data(data) => {
                if let Some(delta) = delta_content(&data) {
                    accumulated.push_str(&delta);
                    on_delta(&delta);
                }
            }
        }
    }
    false
}
