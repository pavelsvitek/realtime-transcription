use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::time::Instant;

use crate::ipc::transcript::*;
use crate::transcription::audio_source::StreamLabels;
use crate::transcription::debug_dump::StreamObserver;
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
    segment_counter: Arc<AtomicU64>,
    mut observer: Option<Box<dyn StreamObserver>>,
    speaker_cut: Option<Arc<AtomicU64>>,
) where
    E: Fn(TranscriptEvent),
{
    tracing::info!("Transcription worker started");
    let mut chunks_processed: u64 = 0;
    let mut seen_cut = speaker_cut
        .as_ref()
        .map(|flag| flag.load(Ordering::Acquire))
        .unwrap_or(0);

    // Optional diagnostics for denied macOS capture permission: the stream opens but
    // delivers digital silence (~-91 dB). Mic is checked quickly; system audio waits
    // longer because loopback can be quiet until a call/video starts.
    let mut mic_samples_seen: usize = 0;
    let mut mic_peak_rms: f32 = 0.0;
    let mut mic_silence_warned = false;
    let mut system_samples_seen: usize = 0;
    let mut system_peak_rms: f32 = 0.0;
    let mut system_silence_warned = false;
    const SILENCE_RMS_THRESHOLD: f32 = 0.01;
    const MIC_SILENCE_CHECK_SAMPLES: usize = 48_000;
    const SYSTEM_SILENCE_CHECK_SAMPLES: usize = 48_000 * 30;

    loop {
        let stopping = stop.load(Ordering::Relaxed);
        let chunk = if stopping {
            match audio_rx.try_recv() {
                Ok(chunk) => chunk,
                Err(_) => break,
            }
        } else {
            match audio_rx.recv_timeout(std::time::Duration::from_millis(100)) {
                Ok(chunk) => chunk,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    flush_speaker_cut(
                        &mut pipeline,
                        &speaker_cut,
                        &mut seen_cut,
                        labels,
                        &emit,
                        &segment_counter,
                        observer.as_mut(),
                    );
                    continue;
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    tracing::debug!("Audio channel closed, draining remaining");
                    break;
                }
            }
        };

        flush_speaker_cut(
            &mut pipeline,
            &speaker_cut,
            &mut seen_cut,
            labels,
            &emit,
            &segment_counter,
            observer.as_mut(),
        );

        // Only the mic stream drives the mic-level indicator.
        if labels.stream == crate::transcription::labels::MIC_STREAM {
            let rms = mic_input::compute_rms(&chunk);
            emit(TranscriptEvent::MicLevel(MicLevel { rms }));
            mic_peak_rms = mic_peak_rms.max(rms);
            mic_samples_seen += chunk.len();
            if !mic_silence_warned && mic_samples_seen >= MIC_SILENCE_CHECK_SAMPLES {
                mic_silence_warned = true;
                if mic_peak_rms < SILENCE_RMS_THRESHOLD {
                    tracing::warn!(
                        peak_rms = mic_peak_rms,
                        samples = mic_samples_seen,
                        "Microphone is silent — likely missing Microphone permission"
                    );
                    emit(TranscriptEvent::Status(TranscriptionStatus {
                        active: true,
                        loading: None,
                        model: None,
                        error: Some(
                            "Microphone is silent. Open System Settings → Privacy & Security → \
                             Microphone and enable Amie, then Stop and Start again. \
                             The mic icon should turn red when you talk."
                                .into(),
                        ),
                    }));
                }
            }
        } else if labels.stream == crate::transcription::labels::SYSTEM_STREAM {
            // [silent-loopback diagnostic] see block comment above `system_samples_seen`
            let rms = mic_input::compute_rms(&chunk);
            system_peak_rms = system_peak_rms.max(rms);
            system_samples_seen += chunk.len();
            if !system_silence_warned && system_samples_seen >= SYSTEM_SILENCE_CHECK_SAMPLES {
                system_silence_warned = true;
                if system_peak_rms < SILENCE_RMS_THRESHOLD {
                    tracing::warn!(
                        peak_rms = system_peak_rms,
                        samples = system_samples_seen,
                        "System audio loopback is silent — likely missing AudioCapture permission"
                    );
                    emit(TranscriptEvent::Status(TranscriptionStatus {
                        active: true,
                        loading: None,
                        model: None,
                        error: Some(
                            "System audio capture is silent. Open System Settings → Privacy & Security \
                             and allow system audio recording for Amie, then restart. \
                             Reset: tccutil reset AudioCapture com.pavel.amie"
                                .into(),
                        ),
                    }));
                }
            }
        }

        if let Some(obs) = observer.as_mut() {
            obs.on_audio(&chunk);
        }

        let push_started = Instant::now();
        match pipeline.push_mono(&chunk) {
            Ok(Some(output)) => {
                chunks_processed += 1;
                if let Some(obs) = observer.as_mut() {
                    obs.on_asr_pass(
                        &format!("chunk-{chunks_processed}"),
                        push_started.elapsed(),
                        chunk.len(),
                    );
                }
                for commit in emit_process_output(
                    &output.committed,
                    &output.tentative,
                    labels,
                    &emit,
                    &segment_counter,
                    false,
                ) {
                    if let Some(obs) = observer.as_mut() {
                        obs.on_commit(&commit);
                    }
                }
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
                if let Some(obs) = observer.take() {
                    obs.on_finished();
                }
                return;
            }
        }
    }

    // Flush remaining audio
    flush_speaker_cut(
        &mut pipeline,
        &speaker_cut,
        &mut seen_cut,
        labels,
        &emit,
        &segment_counter,
        observer.as_mut(),
    );
    match pipeline.finish() {
        Ok(output) if !output.is_empty() => {
            for commit in emit_process_output(
                &output.committed,
                &output.tentative,
                labels,
                &emit,
                &segment_counter,
                true,
            ) {
                if let Some(obs) = observer.as_mut() {
                    obs.on_commit(&commit);
                }
            }
        }
        Ok(_) => {}
        Err(e) => {
            tracing::warn!(error = %e, "Error flushing final audio");
        }
    }

    if let Some(obs) = observer.take() {
        obs.on_finished();
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
    segment_counter: &Arc<AtomicU64>,
    flush_final: bool,
) -> Vec<TranscriptCommit>
where
    E: Fn(TranscriptEvent),
{
    let mut emitted_commits = Vec::new();

    for word in committed {
        let seg_id = segment_counter.fetch_add(1, Ordering::Relaxed);
        let commit = TranscriptCommit {
            speaker: labels.speaker.into(),
            stream: labels.stream.into(),
            text: word.text.clone(),
            start_ms: (word.start * 1000.0) as u64,
            end_ms: (word.end * 1000.0) as u64,
            segment_id: format!("seg-{seg_id}"),
        };
        tracing::debug!(text = %commit.text, "Committed");
        emit(TranscriptEvent::Commit(commit.clone()));
        emitted_commits.push(commit);
    }

    if !tentative.is_empty() {
        if flush_final {
            if emitted_commits.is_empty() {
                let seg_id = segment_counter.fetch_add(1, Ordering::Relaxed);
                let (text, start_ms, end_ms) = join_words(tentative);
                tracing::debug!(text = %text, "Committed tentative tail on flush");
                let commit = TranscriptCommit {
                    speaker: labels.speaker.into(),
                    stream: labels.stream.into(),
                    text,
                    start_ms,
                    end_ms,
                    segment_id: format!("seg-{seg_id}"),
                };
                emit(TranscriptEvent::Commit(commit.clone()));
                emitted_commits.push(commit);
            }
        } else {
            let (text, start_ms, end_ms) = join_words(tentative);
            tracing::debug!(text = %text, "Tentative");
            emit(TranscriptEvent::Partial(TranscriptPartial {
                speaker: labels.speaker.into(),
                stream: labels.stream.into(),
                text,
                start_ms,
                end_ms,
                segment_id: format!("tentative-{}", labels.stream),
            }));
        }
    }

    emitted_commits
}

/// Finalize the in-flight system utterance when the speaker set changed.
fn flush_speaker_cut<E>(
    pipeline: &mut StreamingPipeline,
    speaker_cut: &Option<Arc<AtomicU64>>,
    seen: &mut u64,
    labels: StreamLabels,
    emit: &E,
    segment_counter: &Arc<AtomicU64>,
    mut observer: Option<&mut Box<dyn StreamObserver>>,
) where
    E: Fn(TranscriptEvent),
{
    let Some(flag) = speaker_cut else {
        return;
    };
    loop {
        let current = flag.load(Ordering::Acquire);
        if current == *seen {
            return;
        }
        *seen = current;
        match pipeline.cut_utterance() {
            Ok(Some(output)) => {
                for commit in emit_process_output(
                    &output.committed,
                    &output.tentative,
                    labels,
                    emit,
                    segment_counter,
                    false,
                ) {
                    if let Some(obs) = observer.as_mut() {
                        obs.on_commit(&commit);
                    }
                }
            }
            Ok(None) => {}
            Err(error) => {
                tracing::warn!(error = %error, "Failed to cut utterance on speaker change");
                return;
            }
        }
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
    fn emit_process_output_emits_each_committed_segment() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let committed = vec![word("hello", 0.1, 0.5), word("world", 0.5, 1.0)];
        let commits =
            emit_process_output(&committed, &[], mic_labels(), &emit, &counter, false);

        assert_eq!(commits.len(), 2);
        assert_eq!(commits[0].text, "hello");
        assert_eq!(commits[0].start_ms, 100);
        assert_eq!(commits[0].end_ms, 500);
        assert_eq!(commits[1].text, "world");
        assert_eq!(commits[1].start_ms, 500);
        assert_eq!(commits[1].end_ms, 1000);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 2);
        match &events[0] {
            TranscriptEvent::Commit(c) => assert_eq!(c.text, "hello"),
            _ => panic!("Expected Commit event"),
        }
        match &events[1] {
            TranscriptEvent::Commit(c) => assert_eq!(c.text, "world"),
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
        assert!(emit_process_output(&[], &tentative, mic_labels(), &emit, &counter, false).is_empty());

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 1);
        match &events[0] {
            TranscriptEvent::Partial(p) => {
                assert_eq!(p.speaker, "User");
                assert_eq!(p.stream, "mic");
                assert_eq!(p.text, "testing now");
                assert_eq!(p.start_ms, 1000);
                assert_eq!(p.end_ms, 2000);
                assert_eq!(p.segment_id, "tentative-mic");
            }
            _ => panic!("Expected Partial event"),
        }
    }

    #[test]
    fn partial_segment_id_is_stream_scoped() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let sys_labels = StreamLabels {
            speaker: labels::REMOTE,
            stream: labels::SYSTEM_STREAM,
        };
        let tentative = vec![word("remote", 0.0, 0.5)];
        emit_process_output(&[], &tentative, sys_labels, &emit, &counter, false);

        let events = events.lock().unwrap();
        match &events[0] {
            TranscriptEvent::Partial(p) => {
                assert_eq!(p.segment_id, "tentative-system");
                assert_eq!(p.stream, "system");
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
        let commits =
            emit_process_output(&committed, &tentative, mic_labels(), &emit, &counter, false);
        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].text, "done");

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

    #[test]
    fn emit_process_output_flush_commits_tentative_without_partial() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let tentative = vec![word("final", 1.0, 2.0)];
        let commits =
            emit_process_output(&[], &tentative, mic_labels(), &emit, &counter, true);

        assert_eq!(commits.len(), 1);
        assert_eq!(commits[0].text, "final");
        let events = events.lock().unwrap();
        assert_eq!(events.len(), 1);
        match &events[0] {
            TranscriptEvent::Commit(c) => assert_eq!(c.text, "final"),
            _ => panic!("Expected Commit"),
        }
    }

    #[test]
    fn emit_process_output_flush_ignores_stale_tentative_when_committed_present() {
        let counter = Arc::new(std::sync::atomic::AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_clone = events.clone();
        let emit = move |event: TranscriptEvent| {
            events_clone.lock().unwrap().push(event);
        };

        let committed = vec![word("done", 0.0, 0.5)];
        let tentative = vec![word("stale", 0.5, 1.0)];
        emit_process_output(&committed, &tentative, mic_labels(), &emit, &counter, true);

        let events = events.lock().unwrap();
        assert_eq!(events.len(), 1);
        match &events[0] {
            TranscriptEvent::Commit(c) => assert_eq!(c.text, "done"),
            _ => panic!("Expected Commit only"),
        }
    }

    struct CutProbe {
        cuts: Arc<AtomicU64>,
    }

    impl crate::transcription::pipeline::StreamingAsr for CutProbe {
        fn push_mono(
            &mut self,
            _samples: &[f32],
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            Ok(None)
        }

        fn finish(&mut self) -> anyhow::Result<crate::transcription::pipeline::AsrOutput> {
            Ok(crate::transcription::pipeline::AsrOutput::default())
        }

        fn cut_utterance(
            &mut self,
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            self.cuts.fetch_add(1, Ordering::Relaxed);
            Ok(Some(crate::transcription::pipeline::AsrOutput {
                committed: vec![word("from ada", 0.0, 1.0)],
                tentative: Vec::new(),
            }))
        }
    }

    #[test]
    fn a_speaker_change_cuts_the_in_flight_utterance_once() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(1);
        let stop = Arc::new(AtomicBool::new(false));
        let counter = Arc::new(AtomicU64::new(0));
        let cuts = Arc::new(AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_emit = events.clone();
        let cut = Arc::new(AtomicU64::new(0));
        let pipeline = StreamingPipeline::new(Box::new(CutProbe { cuts: cuts.clone() }));
        let cut_flag = cut.clone();
        let handle = std::thread::spawn(move || {
            run_worker(
                rx,
                pipeline,
                StreamLabels {
                    speaker: labels::REMOTE,
                    stream: labels::SYSTEM_STREAM,
                },
                move |event| events_emit.lock().unwrap().push(event),
                stop,
                counter,
                None,
                Some(cut_flag),
            );
        });

        std::thread::sleep(std::time::Duration::from_millis(50));
        cut.store(1, Ordering::Release);
        let started = std::time::Instant::now();
        while cuts.load(Ordering::Relaxed) == 0 {
            assert!(
                started.elapsed() < std::time::Duration::from_secs(2),
                "speaker cut was not applied"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
        assert_eq!(cuts.load(Ordering::Relaxed), 1);
        drop(tx);
        handle.join().unwrap();

        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            TranscriptEvent::Commit(commit) if commit.text == "from ada"
        )));
    }
}
