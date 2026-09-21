//! xAI real-time speech-to-text via WebSocket (`wss://api.x.ai/v1/stt`).
//!
//! Pins Grok Voice Transcribe 2.0. Omitting `model` would keep the API default of 1.0.

use std::fs;
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender, TryRecvError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, http::HeaderValue, Message},
};

use super::pipeline::{AsrOutput, AsrWord, StreamingAsr};

pub const MODEL_ID: &str = "grok-voice-transcribe-2.0";
pub const MODEL_DISPLAY_NAME: &str = "xAI Transcribe 2.0";
const TARGET_SAMPLE_RATE: u32 = 16_000;
const FRAME_MS: u32 = 100;
const FRAME_BYTES: usize = (TARGET_SAMPLE_RATE as usize * 2 * FRAME_MS as usize) / 1000;
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const FINISH_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Deserialize)]
struct ServerEvent {
    #[serde(rename = "type")]
    kind: String,
    text: Option<String>,
    #[serde(default)]
    is_final: bool,
    #[serde(default)]
    speech_final: bool,
    start: Option<f64>,
    duration: Option<f64>,
    message: Option<String>,
    words: Option<Vec<ServerWord>>,
}

#[derive(Debug, Deserialize)]
struct ServerWord {
    #[allow(dead_code)]
    text: String,
    start: f64,
    end: f64,
}

enum Cmd {
    Audio(Vec<u8>),
    Finish,
}

enum Evt {
    Ready,
    Output(AsrOutput),
    Error(String),
    Done,
}

pub struct XaiWsPipeline {
    cmd_tx: Sender<Cmd>,
    evt_rx: Receiver<Evt>,
    worker: Option<JoinHandle<()>>,
    input_sample_rate: u32,
    pcm_buffer: Vec<u8>,
    input_buffer: Vec<f32>,
    resample_phase: f64,
    ready: bool,
    finished: bool,
    next_frame_at: Option<std::time::Instant>,
}

impl XaiWsPipeline {
    pub fn start(
        api_key: &str,
        language: &str,
        input_sample_rate: u32,
        stream: &str,
        disable_partials: bool,
    ) -> Result<Self> {
        let url = streaming_url(language, disable_partials);

        let (cmd_tx, cmd_rx) = mpsc::channel::<Cmd>();
        let (evt_tx, evt_rx) = mpsc::channel::<Evt>();
        let api_key = api_key.to_string();
        let stream = stream.to_string();

        let worker = thread::Builder::new()
            .name(format!("xai-stt-{stream}"))
            .spawn(move || {
                let rt = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(rt) => rt,
                    Err(err) => {
                        let _ = evt_tx.send(Evt::Error(format!("Failed to start xAI runtime: {err}")));
                        return;
                    }
                };
                rt.block_on(run_session(url, api_key, cmd_rx, evt_tx));
            })
            .context("Failed to spawn xAI WebSocket worker")?;

        let mut pipeline = Self {
            cmd_tx,
            evt_rx,
            worker: Some(worker),
            input_sample_rate: input_sample_rate.max(1),
            pcm_buffer: Vec::with_capacity(FRAME_BYTES * 2),
            input_buffer: Vec::new(),
            resample_phase: 0.0,
            ready: false,
            finished: false,
            next_frame_at: None,
        };

        pipeline.wait_ready()?;
        Ok(pipeline)
    }

    fn wait_ready(&mut self) -> Result<()> {
        let deadline = std::time::Instant::now() + READY_TIMEOUT;
        while std::time::Instant::now() < deadline {
            match self.evt_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Evt::Ready) => {
                    self.ready = true;
                    return Ok(());
                }
                Ok(Evt::Error(message)) => return Err(anyhow!(message)),
                Ok(Evt::Done) => return Err(anyhow!("xAI session closed before ready")),
                Ok(Evt::Output(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(anyhow!("xAI worker disconnected before ready"));
                }
            }
        }
        Err(anyhow!("Timed out waiting for xAI transcript.created"))
    }

    fn drain_events(&mut self) -> Result<Option<AsrOutput>> {
        let mut output = AsrOutput::default();
        loop {
            match self.evt_rx.try_recv() {
                Ok(Evt::Output(chunk)) => {
                    output.committed.extend(chunk.committed);
                    if !chunk.tentative.is_empty() {
                        output.tentative = chunk.tentative;
                    }
                }
                Ok(Evt::Error(message)) => return Err(anyhow!(message)),
                Ok(Evt::Done) => {
                    self.finished = true;
                    break;
                }
                Ok(Evt::Ready) => {}
                Err(TryRecvError::Empty) => break,
                Err(TryRecvError::Disconnected) => {
                    if !self.finished {
                        return Err(anyhow!("xAI worker disconnected"));
                    }
                    break;
                }
            }
        }
        if output.is_empty() {
            Ok(None)
        } else {
            Ok(Some(output))
        }
    }

    fn flush_pcm_frames(&mut self) -> Result<()> {
        while self.pcm_buffer.len() >= FRAME_BYTES {
            let frame: Vec<u8> = self.pcm_buffer.drain(..FRAME_BYTES).collect();
            if let Some(at) = self.next_frame_at {
                let now = std::time::Instant::now();
                if at > now {
                    thread::sleep(at - now);
                }
            }
            self.cmd_tx
                .send(Cmd::Audio(frame))
                .map_err(|_| anyhow!("xAI worker disconnected"))?;
            self.next_frame_at =
                Some(std::time::Instant::now() + Duration::from_millis(u64::from(FRAME_MS)));
        }
        Ok(())
    }

    fn append_resampled_pcm16(&mut self, samples: &[f32]) {
        if samples.is_empty() {
            return;
        }
        if self.input_sample_rate == TARGET_SAMPLE_RATE {
            write_pcm16(samples, &mut self.pcm_buffer);
            return;
        }

        self.input_buffer.extend_from_slice(samples);
        let step = self.input_sample_rate as f64 / f64::from(TARGET_SAMPLE_RATE);
        while self.resample_phase + 1.0 < self.input_buffer.len() as f64 {
            let idx = self.resample_phase.floor() as usize;
            let frac = (self.resample_phase - idx as f64) as f32;
            let a = self.input_buffer[idx];
            let b = self.input_buffer.get(idx + 1).copied().unwrap_or(a);
            let sample = a + (b - a) * frac;
            write_pcm16(&[sample], &mut self.pcm_buffer);
            self.resample_phase += step;
        }

        let consumed = self.resample_phase.floor() as usize;
        if consumed > 0 {
            let drain = consumed.min(self.input_buffer.len());
            self.input_buffer.drain(..drain);
            self.resample_phase -= drain as f64;
            if self.resample_phase < 0.0 {
                self.resample_phase = 0.0;
            }
        }
    }
}

fn write_pcm16(samples: &[f32], out: &mut Vec<u8>) {
    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let int_sample = (clamped * i16::MAX as f32).round() as i16;
        out.extend_from_slice(&int_sample.to_le_bytes());
    }
}

impl StreamingAsr for XaiWsPipeline {
    fn push_mono(&mut self, samples: &[f32]) -> Result<Option<AsrOutput>> {
        if self.finished {
            return Ok(None);
        }
        self.append_resampled_pcm16(samples);
        self.flush_pcm_frames()?;
        self.drain_events()
    }

    fn finish(&mut self) -> Result<AsrOutput> {
        if !self.pcm_buffer.is_empty() {
            let remaining = std::mem::take(&mut self.pcm_buffer);
            let _ = self.cmd_tx.send(Cmd::Audio(remaining));
        }
        let _ = self.cmd_tx.send(Cmd::Finish);

        let mut output = AsrOutput::default();
        let deadline = std::time::Instant::now() + FINISH_TIMEOUT;
        while std::time::Instant::now() < deadline {
            match self.evt_rx.recv_timeout(Duration::from_millis(200)) {
                Ok(Evt::Output(chunk)) => {
                    output.committed.extend(chunk.committed);
                    if !chunk.tentative.is_empty() {
                        output.tentative = chunk.tentative;
                    }
                }
                Ok(Evt::Done) => {
                    self.finished = true;
                    break;
                }
                Ok(Evt::Error(message)) => return Err(anyhow!(message)),
                Ok(Evt::Ready) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    self.finished = true;
                    break;
                }
            }
        }

        // Stop often arrives before speech_final. Promote the last in-flight
        // utterance so a short session still yields transcript.commit rows.
        if let Some(last) = output.tentative.pop() {
            if !output.committed.iter().any(|c| c.text == last.text) {
                output.committed.push(last);
            }
        }
        output.tentative.clear();

        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
        Ok(output)
    }
}

impl Drop for XaiWsPipeline {
    fn drop(&mut self) {
        let _ = self.cmd_tx.send(Cmd::Finish);
        if let Some(handle) = self.worker.take() {
            let _ = handle.join();
        }
    }
}

async fn run_session(url: String, api_key: String, cmd_rx: Receiver<Cmd>, evt_tx: Sender<Evt>) {
    if let Err(err) = run_session_inner(url, api_key, cmd_rx, &evt_tx).await {
        let _ = evt_tx.send(Evt::Error(err.to_string()));
    }
    let _ = evt_tx.send(Evt::Done);
}

async fn run_session_inner(
    url: String,
    api_key: String,
    cmd_rx: Receiver<Cmd>,
    evt_tx: &Sender<Evt>,
) -> Result<()> {
    let mut request = url
        .as_str()
        .into_client_request()
        .context("Invalid xAI WebSocket URL")?;
    let value = HeaderValue::from_str(&format!("Bearer {api_key}"))
        .context("Invalid xAI API key header")?;
    request.headers_mut().insert("Authorization", value);

    let (ws, _) = connect_async(request)
        .await
        .context("Failed to connect to xAI WebSocket")?;
    let (mut write, mut read) = ws.split();

    let mut ready = false;
    let mut map_state = MapState::default();
    let mut finish_sent = false;

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let event: ServerEvent = serde_json::from_str(&text)
                            .with_context(|| format!("Bad xAI event JSON: {text}"))?;
                        match event.kind.as_str() {
                            "transcript.created" => {
                                if !ready {
                                    ready = true;
                                    tracing::info!("xAI transcript.created — ready for audio");
                                    let _ = evt_tx.send(Evt::Ready);
                                }
                            }
                            "transcript.partial" => {
                                tracing::debug!(
                                    is_final = event.is_final,
                                    speech_final = event.speech_final,
                                    text = %event.text.as_deref().unwrap_or(""),
                                    "xAI transcript.partial"
                                );
                                if let Some(output) = map_partial(&event, &mut map_state) {
                                    let _ = evt_tx.send(Evt::Output(output));
                                }
                            }
                            "transcript.done" => {
                                tracing::info!(
                                    text_len = event.text.as_ref().map(|t| t.len()).unwrap_or(0),
                                    "xAI transcript.done"
                                );
                                if let Some(output) =
                                    flush_in_flight(&mut map_state, event.text.as_deref())
                                {
                                    let _ = evt_tx.send(Evt::Output(output));
                                }
                                return Ok(());
                            }
                            "error" => {
                                let message = event
                                    .message
                                    .unwrap_or_else(|| "Unknown xAI STT error".into());
                                return Err(anyhow!(message));
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        write.send(Message::Pong(payload)).await.ok();
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        if finish_sent {
                            if let Some(output) = flush_in_flight(&mut map_state, None) {
                                let _ = evt_tx.send(Evt::Output(output));
                            }
                            return Ok(());
                        }
                        return Err(anyhow!("xAI WebSocket closed unexpectedly"));
                    }
                    Some(Ok(_)) => {}
                    Some(Err(err)) => return Err(anyhow!("xAI WebSocket read error: {err}")),
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(10)) => {
                loop {
                    match cmd_rx.try_recv() {
                        Ok(Cmd::Audio(bytes)) => {
                            if !ready {
                                continue;
                            }
                            write
                                .send(Message::Binary(bytes.into()))
                                .await
                                .context("Failed to send audio frame to xAI")?;
                        }
                        Ok(Cmd::Finish) => {
                            if !finish_sent {
                                finish_sent = true;
                                write
                                    .send(Message::Text(r#"{"type":"audio.done"}"#.into()))
                                    .await
                                    .context("Failed to send audio.done to xAI")?;
                            }
                        }
                        Err(TryRecvError::Empty) => break,
                        Err(TryRecvError::Disconnected) => {
                            if !finish_sent {
                                let _ = write
                                    .send(Message::Text(r#"{"type":"audio.done"}"#.into()))
                                    .await;
                            }
                            // Keep reading until transcript.done / close.
                            break;
                        }
                    }
                }
            }
        }
    }
}

#[derive(Debug, Default)]
struct MapState {
    last_committed: String,
    last_committed_end: f64,
    /// Locked chunk-final text for the in-flight utterance.
    locked: String,
    utterance_start: f64,
}

fn stitch_chunk(existing: &str, incoming: &str) -> String {
    if existing.is_empty() {
        return incoming.to_string();
    }
    if incoming.is_empty() || incoming == existing {
        return existing.to_string();
    }
    if incoming.starts_with(existing) {
        return incoming.to_string();
    }
    format!("{existing} {incoming}")
}

fn resolve_utterance_start(state: &MapState, event_start: f64) -> f64 {
    if state.utterance_start > 0.0 {
        state.utterance_start
    } else if event_start > 0.0 {
        event_start
    } else {
        state.last_committed_end
    }
}

/// Commit leftover in-flight text when the session ends without `speech_final`.
fn flush_in_flight(state: &mut MapState, done_text: Option<&str>) -> Option<AsrOutput> {
    let text = if !state.locked.trim().is_empty() {
        state.locked.trim().to_string()
    } else if state.last_committed.is_empty() {
        done_text
            .map(str::trim)
            .filter(|s| !s.is_empty())?
            .to_string()
    } else {
        return None;
    };
    if text == state.last_committed {
        return None;
    }
    let start = if state.utterance_start > 0.0 {
        state.utterance_start
    } else {
        state.last_committed_end
    };
    state.last_committed = text.clone();
    state.last_committed_end = start;
    state.locked.clear();
    state.utterance_start = 0.0;
    Some(AsrOutput {
        committed: vec![AsrWord {
            text,
            start,
            end: start,
        }],
        tentative: Vec::new(),
    })
}

fn map_partial(event: &ServerEvent, state: &mut MapState) -> Option<AsrOutput> {
    let text = event.text.as_deref()?.trim();
    if text.is_empty() {
        return None;
    }

    let (event_start, event_end) =
        timing_from_event(event.start, event.duration, event.words.as_deref());

    // Utterance final: commit the complete stitched utterance once.
    // Chunk finals (`is_final` without `speech_final`) lock ~3s of speech;
    // later interims are often only the next chunk, not the full utterance.
    if event.is_final && event.speech_final {
        if text == state.last_committed.as_str() {
            state.locked.clear();
            state.utterance_start = 0.0;
            return None;
        }
        let start = resolve_utterance_start(state, event_start);
        let end = if event_end > start { event_end } else { start };
        state.last_committed = text.to_string();
        state.last_committed_end = end;
        state.locked.clear();
        state.utterance_start = 0.0;
        return Some(AsrOutput {
            committed: vec![AsrWord {
                text: text.to_string(),
                start,
                end,
            }],
            tentative: Vec::new(),
        });
    }

    if state.utterance_start <= 0.0 && event_start > 0.0 {
        state.utterance_start = event_start;
    }
    let start = resolve_utterance_start(state, event_start);
    let end = if event_end > start { event_end } else { start };

    let tentative_text = if event.is_final {
        state.locked = stitch_chunk(&state.locked, text);
        state.locked.clone()
    } else if state.locked.is_empty() || text.starts_with(&state.locked) {
        text.to_string()
    } else {
        stitch_chunk(&state.locked, text)
    };

    Some(AsrOutput {
        committed: Vec::new(),
        tentative: vec![AsrWord {
            text: tentative_text,
            start,
            end,
        }],
    })
}

fn timing_from_event(
    start: Option<f64>,
    duration: Option<f64>,
    words: Option<&[ServerWord]>,
) -> (f64, f64) {
    if let Some(words) = words {
        if let (Some(first), Some(last)) = (words.first(), words.last()) {
            return (first.start, last.end);
        }
    }
    let start = start.unwrap_or(0.0);
    let end = duration.map(|d| start + d).unwrap_or(start);
    (start, end)
}

pub fn app_support_root() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    PathBuf::from(home).join("Library/Application Support/com.pavel.amie")
}

fn api_key_path() -> PathBuf {
    app_support_root().join("xai_api_key")
}

pub fn resolve_api_key() -> Option<String> {
    if let Ok(value) = std::env::var("XAI_API_KEY") {
        let trimmed = value.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    load_api_key()
}

pub fn load_api_key() -> Option<String> {
    let path = api_key_path();
    fs::read_to_string(path)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

pub fn save_api_key(key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("API key cannot be empty".into());
    }
    let root = app_support_root();
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create app support dir: {e}"))?;
    fs::write(api_key_path(), trimmed).map_err(|e| format!("Failed to save API key: {e}"))
}

pub fn clear_api_key() -> Result<(), String> {
    let path = api_key_path();
    if path.exists() {
        fs::remove_file(path).map_err(|e| format!("Failed to clear API key: {e}"))?;
    }
    Ok(())
}

pub fn api_key_is_set() -> bool {
    resolve_api_key().is_some()
}

pub fn streaming_url(language: &str, disable_partials: bool) -> String {
    let interim = !disable_partials;
    format!(
        "wss://api.x.ai/v1/stt?sample_rate={TARGET_SAMPLE_RATE}&encoding=pcm&interim_results={interim}&language={language}&endpointing=800&filler_words=false&model={MODEL_ID}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ev(json: &str) -> ServerEvent {
        serde_json::from_str(json).expect("event json")
    }

    #[test]
    fn streaming_url_pins_transcribe_2() {
        let url = streaming_url("en", false);
        assert!(url.contains("model=grok-voice-transcribe-2.0"));
        assert!(url.contains("interim_results=true"));
        assert!(url.contains("sample_rate=16000"));
        assert!(url.contains("encoding=pcm"));
        assert!(url.contains("language=en"));
    }

    #[test]
    fn streaming_url_can_disable_partials() {
        let url = streaming_url("en", true);
        assert!(url.contains("interim_results=false"));
        assert!(url.contains("model=grok-voice-transcribe-2.0"));
    }

    #[test]
    fn chunk_final_then_delta_interim_keeps_locked_prefix() {
        let mut state = MapState::default();
        let locked = map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"This is a test of XAI API","is_final":true,"speech_final":false,"start":1.52,"duration":3.0}"#,
            ),
            &mut state,
        )
        .unwrap();
        assert_eq!(locked.tentative[0].text, "This is a test of XAI API");

        let interim = map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"real-time Voice to Text","is_final":false,"speech_final":false,"start":0.0,"duration":1.2}"#,
            ),
            &mut state,
        )
        .unwrap();
        assert_eq!(
            interim.tentative[0].text,
            "This is a test of XAI API real-time Voice to Text"
        );
        assert!(
            interim.tentative[0].start >= 1.52,
            "partial must not reset to start=0 after a timed chunk"
        );
    }

    #[test]
    fn full_stitch_interim_replaces_locked_prefix() {
        let mut state = MapState::default();
        map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"This is a test","is_final":true,"speech_final":false,"start":1.5,"duration":2.0}"#,
            ),
            &mut state,
        );
        let interim = map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"This is a test of XAI API","is_final":false,"speech_final":false,"start":1.5,"duration":3.0}"#,
            ),
            &mut state,
        )
        .unwrap();
        assert_eq!(interim.tentative[0].text, "This is a test of XAI API");
    }

    #[test]
    fn speech_final_commits_full_utterance_and_clears_lock() {
        let mut state = MapState::default();
        map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"This is a test of XAI API","is_final":true,"speech_final":false,"start":1.52,"duration":3.0}"#,
            ),
            &mut state,
        );
        let done = map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"This is a test of XAI API real-time Voice to Text transcription service. I'll see if this works correctly, correctly or not.","is_final":true,"speech_final":true,"start":1.52,"duration":11.76}"#,
            ),
            &mut state,
        )
        .unwrap();
        assert_eq!(done.tentative.len(), 0);
        assert!(done.committed[0]
            .text
            .contains("I'll see if this works correctly"));
        assert!(state.locked.is_empty());

        let next = map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"It seems that some of the sentences","is_final":false,"speech_final":false,"start":0.0,"duration":0.8}"#,
            ),
            &mut state,
        )
        .unwrap();
        assert_eq!(
            next.tentative[0].text,
            "It seems that some of the sentences"
        );
        assert!(next.tentative[0].start >= 1.52);
    }

    #[test]
    fn flush_in_flight_commits_locked_text_without_speech_final() {
        let mut state = MapState::default();
        map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"Two or three sentences here","is_final":true,"speech_final":false,"start":0.4,"duration":2.5}"#,
            ),
            &mut state,
        );
        let flushed = flush_in_flight(&mut state, None).unwrap();
        assert_eq!(flushed.committed[0].text, "Two or three sentences here");
        assert!(state.locked.is_empty());
        assert!(flush_in_flight(&mut state, Some("Two or three sentences here")).is_none());
    }

    #[test]
    fn flush_in_flight_uses_done_text_when_nothing_was_committed() {
        let mut state = MapState::default();
        let flushed = flush_in_flight(&mut state, Some("  Hello from a short stop  ")).unwrap();
        assert_eq!(flushed.committed[0].text, "Hello from a short stop");
    }

    #[test]
    fn flush_in_flight_skips_full_session_text_after_speech_final() {
        let mut state = MapState::default();
        map_partial(
            &ev(
                r#"{"type":"transcript.partial","text":"Already saved","is_final":true,"speech_final":true,"start":0.0,"duration":1.0}"#,
            ),
            &mut state,
        );
        assert!(flush_in_flight(&mut state, Some("Already saved plus more")).is_none());
    }
}
