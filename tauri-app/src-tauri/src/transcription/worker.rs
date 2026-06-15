use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;

use crate::ipc::transcript::*;
use crate::transcription::audio_source::StreamLabels;
use crate::transcription::mic_input;
use crate::transcription::pipeline::{AsrWord, StreamingPipeline};

/// Runs the transcription worker loop.
///
/// Reads audio chunks from `audio_rx`, feeds them through the ASR pipeline,
/// and emits transcript events via the `emit` callback.
///
/// The generic `emit` parameter keeps this function testable without a Tauri runtime:
/// in production it wraps `AppHandle::emit`, in tests it collects into a `Vec`.
pub fn run_worker<E>(
    audio_rx: Receiver<Vec<f32>>,
    mut pipeline: StreamingPipeline,
    labels: StreamLabels,
    emit: E,
    stop: Arc<AtomicBool>,
    segment_counter: Arc<std::sync::atomic::AtomicU64>,
) where
    E: Fn(TranscriptEvent),
{
    tracing::info!("Transcription worker started");
    let mut chunks_processed: u64 = 0;

    while !stop.load(Ordering::Relaxed) {
        let chunk = match audio_rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(chunk) => chunk,
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                tracing::debug!("Audio channel closed, draining remaining");
                break;
            }
        };

        let rms = mic_input::compute_rms(&chunk);
        emit(TranscriptEvent::MicLevel(MicLevel { rms }));

        match pipeline.push_mono(&chunk) {
            Ok(Some(output)) => {
                chunks_processed += 1;
                emit_process_output(
                    &output.committed,
                    &output.tentative,
                    labels,
                    &emit,
                    &segment_counter,
                );
            }
            Ok(None) => {
                tracing::trace!(chunk_len = chunk.len(), "Buffered, no ASR pass yet");
            }
            Err(e) => {
                tracing::error!(error = %e, "ASR processing error");
                emit(TranscriptEvent::Status(TranscriptionStatus {
                    active: false,
                    loading: None,
                    model: None,
                    error: Some(format!("ASR error: {e}")),
                }));
                return;
            }
        }
    }

    // Flush remaining audio
    match pipeline.finish() {
        Ok(output) if !output.is_empty() => {
            emit_process_output(
                &output.committed,
                &output.tentative,
                labels,
                &emit,
                &segment_counter,
            );
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(error = %e, "Error flushing final audio");
        }
    }

    tracing::info!(chunks_processed, "Transcription worker stopped");
}

fn join_words(words: &[AsrWord]) -> (String, u64, u64) {
    let text: String = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
    let start_ms = words.first().map(|w| (w.start * 1000.0) as u64).unwrap_or(0);
    let end_ms = words.last().map(|w| (w.end * 1000.0) as u64).unwrap_or(0);
    (text, start_ms, end_ms)
}

fn emit_process_output<E>(
    committed: &[AsrWord],
    tentative: &[AsrWord],
    labels: StreamLabels,
    emit: &E,
    segment_counter: &Arc<std::sync::atomic::AtomicU64>,
) where
    E: Fn(TranscriptEvent),
{
    if !committed.is_empty() {
        let seg_id = segment_counter.fetch_add(1, Ordering::Relaxed);
        let (text, start_ms, end_ms) = join_words(committed);
        tracing::debug!(text = %text, words = committed.len(), "Committed");
        emit(TranscriptEvent::Commit(TranscriptCommit {
            speaker: labels.speaker.into(),
            stream: labels.stream.into(),
            text,
            start_ms,
            end_ms,
            segment_id: format!("seg-{seg_id}"),
        }));
    }

    if !tentative.is_empty() {
        let (text, start_ms, end_ms) = join_words(tentative);
        tracing::debug!(text = %text, "Tentative");
        emit(TranscriptEvent::Partial(TranscriptPartial {
            speaker: labels.speaker.into(),
            stream: labels.stream.into(),
            text,
            start_ms,
            end_ms,
            segment_id: "tentative".into(),
        }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcription::labels;
    use std::sync::Mutex;

    fn mic_labels() -> StreamLabels {
        StreamLabels {
            speaker: labels::USER,
            stream: labels::MIC_STREAM,
        }
    }

    fn word(text: &str, start: f64, end: f64) -> AsrWord {
        AsrWord {
            text: text.into(),
            start,
            end,
        }
    }

    #[test]
    fn worker_exits_on_channel_close() {
        let (_tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(1);
        drop(_tx);

        let handle = std::thread::spawn(move || {
            match rx.recv_timeout(std::time::Duration::from_millis(10)) {
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {}
                _ => panic!("Expected disconnected channel"),
            }
        });

        handle.join().unwrap();
    }

    #[test]
    fn emit_process_output_groups_committed_words() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let committed = vec![word("hello", 0.1, 0.5), word("world", 0.5, 1.0)];
        emit_process_output(&committed, &[], mic_labels(), &emit, &counter);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 1);
        match &events[0] {
            TranscriptEvent::Commit(c) => {
                assert_eq!(c.speaker, "User");
                assert_eq!(c.stream, "mic");
                assert_eq!(c.text, "hello world");
                assert_eq!(c.start_ms, 100);
                assert_eq!(c.end_ms, 1000);
                assert_eq!(c.segment_id, "seg-0");
            }
            _ => panic!("Expected Commit event"),
        }
    }

    #[test]
    fn emit_process_output_emits_tentative_as_partial() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let tentative = vec![word("testing", 1.0, 1.5), word("now", 1.5, 2.0)];
        emit_process_output(&[], &tentative, mic_labels(), &emit, &counter);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 1);
        match &events[0] {
            TranscriptEvent::Partial(p) => {
                assert_eq!(p.speaker, "User");
                assert_eq!(p.stream, "mic");
                assert_eq!(p.text, "testing now");
                assert_eq!(p.start_ms, 1000);
                assert_eq!(p.end_ms, 2000);
                assert_eq!(p.segment_id, "tentative");
            }
            _ => panic!("Expected Partial event"),
        }
    }

    #[test]
    fn emit_process_output_emits_commit_then_partial() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let committed = vec![word("done", 0.0, 0.5)];
        let tentative = vec![word("maybe", 0.5, 1.0)];
        emit_process_output(&committed, &tentative, mic_labels(), &emit, &counter);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        match &events[0] {
            TranscriptEvent::Commit(c) => assert_eq!(c.text, "done"),
            _ => panic!("Expected Commit"),
        }
        match &events[1] {
            TranscriptEvent::Partial(p) => assert_eq!(p.text, "maybe"),
            _ => panic!("Expected Partial"),
        }
    }
}
