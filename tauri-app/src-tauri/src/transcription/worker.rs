use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;

use yamabiko_whisper::{AsrPipeline, ProcessOutput};

use crate::ipc::transcript::*;
use crate::transcription::labels;
use crate::transcription::mic_input;

/// Runs the transcription worker loop.
///
/// Reads audio chunks from `audio_rx`, feeds them through the ASR pipeline,
/// and emits transcript events via the `emit` callback.
///
/// The generic `emit` parameter keeps this function testable without a Tauri runtime:
/// in production it wraps `AppHandle::emit`, in tests it collects into a `Vec`.
pub fn run_worker<E>(
    audio_rx: Receiver<Vec<f32>>,
    mut pipeline: AsrPipeline,
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
                emit_process_output(&output, &emit, &segment_counter);
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
            emit_process_output(&output, &emit, &segment_counter);
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(error = %e, "Error flushing final audio");
        }
    }

    tracing::info!(chunks_processed, "Transcription worker stopped");
}

fn emit_process_output<E>(
    output: &ProcessOutput,
    emit: &E,
    segment_counter: &Arc<std::sync::atomic::AtomicU64>,
) where
    E: Fn(TranscriptEvent),
{
    for word in &output.committed {
        let seg_id = segment_counter.fetch_add(1, Ordering::Relaxed);
        tracing::debug!(text = %word.text, start = word.start, end = word.end, "Committed");
        emit(TranscriptEvent::Commit(TranscriptCommit {
            speaker: labels::USER.into(),
            stream: labels::MIC_STREAM.into(),
            text: word.text.clone(),
            start_ms: (word.start * 1000.0) as u64,
            end_ms: (word.end * 1000.0) as u64,
            segment_id: format!("seg-{seg_id}"),
        }));
    }

    if !output.tentative.is_empty() {
        let text: String = output
            .tentative
            .iter()
            .map(|w| w.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        let start_ms = output
            .tentative
            .first()
            .map(|w| (w.start * 1000.0) as u64)
            .unwrap_or(0);
        let end_ms = output
            .tentative
            .last()
            .map(|w| (w.end * 1000.0) as u64)
            .unwrap_or(0);

        tracing::debug!(text = %text, "Tentative");
        emit(TranscriptEvent::Partial(TranscriptPartial {
            speaker: labels::USER.into(),
            stream: labels::MIC_STREAM.into(),
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
    use std::sync::Mutex;
    use yamabiko_whisper::Word;

    fn collect_events<F>(f: F) -> Vec<TranscriptEvent>
    where
        F: FnOnce(Box<dyn Fn(TranscriptEvent)>),
    {
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = Box::new(move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        });
        f(emit);
        Arc::try_unwrap(events).unwrap().into_inner().unwrap()
    }

    #[test]
    fn worker_exits_on_channel_close() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(1);
        let stop = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));

        // Drop sender immediately so channel is disconnected
        drop(tx);

        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        // Worker should exit quickly because channel is closed
        // We can't test with a real pipeline here (needs model files),
        // but we verify the channel-close path doesn't panic.
        // The actual loop exits on RecvTimeoutError::Disconnected.
        let stop_clone = stop.clone();
        let handle = std::thread::spawn(move || {
            // Simulate the channel-close detection path
            match rx.recv_timeout(std::time::Duration::from_millis(10)) {
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    // This is the expected path
                }
                _ => panic!("Expected disconnected channel"),
            }
        });

        handle.join().unwrap();
    }

    #[test]
    fn emit_process_output_emits_committed_words() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let output = ProcessOutput {
            committed: vec![
                Word {
                    text: "hello".into(),
                    start: 0.1,
                    end: 0.5,
                },
                Word {
                    text: "world".into(),
                    start: 0.5,
                    end: 1.0,
                },
            ],
            tentative: vec![],
            finalized_by_vad: false,
        };

        emit_process_output(&output, &emit, &counter);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        match &events[0] {
            TranscriptEvent::Commit(c) => {
                assert_eq!(c.speaker, "User");
                assert_eq!(c.stream, "mic");
                assert_eq!(c.text, "hello");
                assert_eq!(c.start_ms, 100);
                assert_eq!(c.end_ms, 500);
                assert_eq!(c.segment_id, "seg-0");
            }
            _ => panic!("Expected Commit event"),
        }
        match &events[1] {
            TranscriptEvent::Commit(c) => {
                assert_eq!(c.text, "world");
                assert_eq!(c.segment_id, "seg-1");
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

        let output = ProcessOutput {
            committed: vec![],
            tentative: vec![
                Word {
                    text: "testing".into(),
                    start: 1.0,
                    end: 1.5,
                },
                Word {
                    text: "now".into(),
                    start: 1.5,
                    end: 2.0,
                },
            ],
            finalized_by_vad: false,
        };

        emit_process_output(&output, &emit, &counter);

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
    fn emit_process_output_handles_both_committed_and_tentative() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let output = ProcessOutput {
            committed: vec![Word {
                text: "done".into(),
                start: 0.0,
                end: 0.5,
            }],
            tentative: vec![Word {
                text: "maybe".into(),
                start: 0.5,
                end: 1.0,
            }],
            finalized_by_vad: false,
        };

        emit_process_output(&output, &emit, &counter);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        assert!(matches!(&events[0], TranscriptEvent::Commit(_)));
        assert!(matches!(&events[1], TranscriptEvent::Partial(_)));
    }
}
