//! Incremental parser for OpenAI-style Server-Sent Events used by xAI Chat Completions.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SseItem {
    Data(String),
    Done,
}

#[derive(Debug, Default)]
pub struct SseParser {
    buf: String,
}

impl SseParser {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn push(&mut self, chunk: &str) -> Vec<SseItem> {
        self.buf.push_str(chunk);
        self.drain_lines(false)
    }

    pub fn finish(&mut self) -> Vec<SseItem> {
        self.drain_lines(true)
    }

    fn drain_lines(&mut self, flush: bool) -> Vec<SseItem> {
        let mut items = Vec::new();
        loop {
            let Some(idx) = self.buf.find('\n') else {
                break;
            };
            let mut line: String = self.buf.drain(..=idx).collect();
            line.pop(); // '\n'
            if line.ends_with('\r') {
                line.pop();
            }
            if let Some(item) = parse_sse_line(&line) {
                items.push(item);
            }
        }
        if flush && !self.buf.is_empty() {
            let line = std::mem::take(&mut self.buf);
            if let Some(item) = parse_sse_line(line.trim_end_matches('\r')) {
                items.push(item);
            }
        }
        items
    }
}

fn parse_sse_line(line: &str) -> Option<SseItem> {
    let line = line.trim();
    if line.is_empty() || line.starts_with(':') {
        return None;
    }
    let data = line.strip_prefix("data:")?.trim();
    if data == "[DONE]" {
        return Some(SseItem::Done);
    }
    Some(SseItem::Data(data.to_string()))
}

/// Extract `choices[0].delta.content` from an OpenAI-style SSE JSON payload.
/// Malformed JSON or missing content yields `None` (skip the chunk).
pub fn delta_content(data: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(data).ok()?;
    let content = value
        .get("choices")?
        .get(0)?
        .get("delta")?
        .get("content")?
        .as_str()?;
    if content.is_empty() {
        None
    } else {
        Some(content.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
        "data: [DONE]\n\n",
    );

    #[test]
    fn parses_content_deltas_from_fixture_bytes() {
        let mut parser = SseParser::new();
        let bytes = FIXTURE.as_bytes();
        let mut items = Vec::new();
        // Split mid-token so the buffer has to reassemble lines.
        for chunk in bytes.chunks(17) {
            items.extend(parser.push(std::str::from_utf8(chunk).unwrap()));
        }
        items.extend(parser.finish());

        let deltas: Vec<_> = items
            .iter()
            .filter_map(|item| match item {
                SseItem::Data(data) => delta_content(data),
                SseItem::Done => None,
            })
            .collect();
        assert_eq!(deltas, vec!["Hello", " world"]);
    }

    #[test]
    fn parses_done_sentinel() {
        let mut parser = SseParser::new();
        let items = parser.push("data: [DONE]\n");
        assert_eq!(items, vec![SseItem::Done]);
    }

    #[test]
    fn malformed_chunk_is_skipped() {
        let mut parser = SseParser::new();
        let items = parser.push("data: {not json}\n\ndata: {\"choices\":[]}\n\n");
        assert_eq!(items.len(), 2);
        match &items[0] {
            SseItem::Data(data) => assert!(delta_content(data).is_none()),
            other => panic!("expected data, got {other:?}"),
        }
        match &items[1] {
            SseItem::Data(data) => assert!(delta_content(data).is_none()),
            other => panic!("expected data, got {other:?}"),
        }
    }
}
