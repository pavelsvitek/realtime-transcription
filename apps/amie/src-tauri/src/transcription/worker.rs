use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::time::Instant;

use crate::ipc::transcript::*;
use crate::transcription::audio_source::StreamLabels;
use crate::transcription::debug_dump::StreamObserver;
use crate::transcription::mic_input;
use crate::transcription::mic_mute::MicMuteGate;
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
    mut speaker_cuts: Option<SpeakerCuts>,
    mic_mute: Option<MicMuteGate>,
) where
    E: Fn(TranscriptEvent),
{
    tracing::info!("Transcription worker started");
    let mut was_muted = false;
    let mut chunks_processed: u64 = 0;

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
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    tracing::debug!("Audio channel closed, draining remaining");
                    break;
                }
            }
        };

        // The meeting app's mute button wins over the microphone. Silence keeps the
        // pipeline's clock running, so mic and system timestamps stay aligned.
        let mut chunk = chunk;
        let muted = labels.stream == crate::transcription::labels::MIC_STREAM
            && mic_mute.as_ref().is_some_and(MicMuteGate::is_muted);
        if muted != was_muted {
            was_muted = muted;
            tracing::info!(muted, "Microphone follows the meeting app's mute button");
            if muted {
                // Commit what was said before the mute instead of holding it open.
                cut_in_flight_utterance(
                    &mut pipeline,
                    labels,
                    &emit,
                    &segment_counter,
                    observer.as_mut(),
                );
            }
        }
        if muted {
            chunk.fill(0.0);
        }

        // Mic and system levels are separate: the mic icon follows only the mic,
        // and each silence banner hides on its own stream's level.
        if muted {
            // Muted silence is not a missing Microphone permission.
            emit(TranscriptEvent::MicLevel(MicLevel { rms: 0.0, muted: true }));
        } else if labels.stream == crate::transcription::labels::MIC_STREAM {
            let rms = mic_input::compute_rms(&chunk);
            emit(TranscriptEvent::MicLevel(MicLevel { rms, muted: false }));
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
            emit(TranscriptEvent::SystemLevel(MicLevel { rms, muted: false }));
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
                    let identity = crate::speakers::app_identity();
                    emit(TranscriptEvent::Status(TranscriptionStatus {
                        active: true,
                        loading: None,
                        model: None,
                        error: Some(format!(
                            "System audio capture is silent. Open System Settings → Privacy & Security \
                             and allow system audio recording for {}, then restart. \
                             Reset: tccutil reset AudioCapture {}",
                            identity.label,
                            identity.bundle_id.as_deref().unwrap_or("com.pavel.amie"),
                        )),
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

        // A speaker handover cuts only once the audio pauses, after this chunk
        // reached the ASR, so the cut never lands inside a word.
        if speaker_cuts.as_mut().is_some_and(|cuts| cuts.ready(&chunk)) {
            cut_in_flight_utterance(
                &mut pipeline,
                labels,
                &emit,
                &segment_counter,
                observer.as_mut(),
            );
        }
    }

    // Flush remaining audio. `finish` finalizes, so a held cut has nothing left to do.
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

/// Commit the in-flight utterance without ending the session.
fn cut_in_flight_utterance<E>(
    pipeline: &mut StreamingPipeline,
    labels: StreamLabels,
    emit: &E,
    segment_counter: &Arc<AtomicU64>,
    mut observer: Option<&mut Box<dyn StreamObserver>>,
) where
    E: Fn(TranscriptEvent),
{
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
            tracing::warn!(error = %error, "Failed to cut utterance on mute");
        }
    }
}

/// Speaker handovers from the meeting app, held until the audio pauses.
///
/// Finalizing an utterance mid-word loses that word: the ASR closes it with
/// padding and the next session starts with no context. The speaking meters
/// also lag the audio, so a cut taken the moment it is signalled lands on the
/// next speaker's first word. Several handovers while one is held collapse
/// into a single cut.
pub struct SpeakerCuts {
    flag: Arc<AtomicU64>,
    seen: u64,
    pause_samples: usize,
    max_wait_samples: usize,
    held: Option<HeldCut>,
}

#[derive(Default)]
struct HeldCut {
    waited_samples: usize,
    quiet_samples: usize,
}

impl SpeakerCuts {
    /// Quiet this long counts as a pause between words or speakers.
    pub const PAUSE_MS: usize = 200;
    /// Cut anyway after this long, so attribution does not drift with no pause.
    pub const MAX_WAIT_MS: usize = 1_500;
    /// Same speech level the local ASR helper uses for its own end of utterance.
    pub const QUIET_RMS: f32 = 0.01;

    pub fn new(flag: Arc<AtomicU64>, sample_rate: u32) -> Self {
        let per_ms = sample_rate as usize / 1_000;
        Self {
            seen: flag.load(Ordering::Acquire),
            flag,
            pause_samples: Self::PAUSE_MS * per_ms,
            max_wait_samples: Self::MAX_WAIT_MS * per_ms,
            held: None,
        }
    }

    /// Account for `chunk` and say whether the held cut should happen now.
    fn ready(&mut self, chunk: &[f32]) -> bool {
        let current = self.flag.load(Ordering::Acquire);
        if current != self.seen {
            self.seen = current;
            self.held.get_or_insert_with(HeldCut::default);
        }
        let Some(held) = self.held.as_mut() else {
            return false;
        };
        held.waited_samples += chunk.len();
        if mic_input::compute_rms(chunk) < Self::QUIET_RMS {
            held.quiet_samples += chunk.len();
        } else {
            held.quiet_samples = 0;
        }
        let ready = held.quiet_samples >= self.pause_samples
            || held.waited_samples >= self.max_wait_samples;
        if ready {
            self.held = None;
        }
        ready
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
        pushes: usize,
        /// How many chunks had reached the ASR at each cut.
        cut_at: Arc<Mutex<Vec<usize>>>,
    }

    impl crate::transcription::pipeline::StreamingAsr for CutProbe {
        fn push_mono(
            &mut self,
            _samples: &[f32],
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            self.pushes += 1;
            Ok(None)
        }

        fn finish(&mut self) -> anyhow::Result<crate::transcription::pipeline::AsrOutput> {
            Ok(crate::transcription::pipeline::AsrOutput::default())
        }

        fn cut_utterance(
            &mut self,
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            self.cut_at.lock().unwrap().push(self.pushes);
            Ok(Some(crate::transcription::pipeline::AsrOutput {
                committed: vec![word("from ada", 0.0, 1.0)],
                tentative: Vec::new(),
            }))
        }
    }

    #[test]
    fn a_speaker_change_cuts_once_at_the_next_pause() {
        const RATE: u32 = 16_000;
        const CHUNK: usize = RATE as usize / 100;
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(128);
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_emit = events.clone();
        let cut_at = Arc::new(Mutex::new(Vec::new()));
        let pipeline = StreamingPipeline::new(Box::new(CutProbe {
            pushes: 0,
            cut_at: cut_at.clone(),
        }));
        let flag = Arc::new(AtomicU64::new(0));
        let cuts = SpeakerCuts::new(flag.clone(), RATE);
        // The meters flag a handover while the speaker is still mid-sentence.
        flag.fetch_add(1, Ordering::Release);
        for _ in 0..40 {
            tx.send(vec![0.2; CHUNK]).unwrap();
        }
        for _ in 0..30 {
            tx.send(vec![0.0; CHUNK]).unwrap();
        }
        drop(tx);

        run_worker(
            rx,
            pipeline,
            StreamLabels {
                speaker: labels::REMOTE,
                stream: labels::SYSTEM_STREAM,
            },
            move |event| events_emit.lock().unwrap().push(event),
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicU64::new(0)),
            None,
            Some(cuts),
            None,
        );

        // 40 chunks of speech, then 200 ms of quiet.
        assert_eq!(*cut_at.lock().unwrap(), vec![60]);
        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            TranscriptEvent::Commit(commit) if commit.text == "from ada"
        )));
    }

    struct IdleAsr;

    impl crate::transcription::pipeline::StreamingAsr for IdleAsr {
        fn push_mono(
            &mut self,
            _samples: &[f32],
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            Ok(None)
        }

        fn finish(&mut self) -> anyhow::Result<crate::transcription::pipeline::AsrOutput> {
            Ok(crate::transcription::pipeline::AsrOutput::default())
        }
    }

    #[test]
    fn system_audio_emits_its_own_level_and_not_the_mic_meter() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(2);
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_emit = events.clone();
        tx.send(vec![0.0; 8]).unwrap();
        tx.send(vec![0.25; 8]).unwrap();
        drop(tx);

        run_worker(
            rx,
            StreamingPipeline::new(Box::new(IdleAsr)),
            StreamLabels {
                speaker: labels::REMOTE,
                stream: labels::SYSTEM_STREAM,
            },
            move |event| events_emit.lock().unwrap().push(event),
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicU64::new(0)),
            None,
            None,
            None,
        );

        let events = events.lock().unwrap();
        let mut saw_mic_level = false;
        let levels: Vec<f32> = events
            .iter()
            .filter_map(|event| match event {
                TranscriptEvent::SystemLevel(level) => Some(level.rms),
                TranscriptEvent::MicLevel(_) => {
                    saw_mic_level = true;
                    None
                }
                _ => None,
            })
            .collect();
        assert!(!saw_mic_level, "system audio must not drive the mic icon");
        assert_eq!(levels.len(), 2);
        assert!(levels[0] < 0.01, "silence stays under the speech threshold");
        assert!(
            levels[1] > 0.01,
            "a loud chunk is the signal that hides the system banner"
        );
    }
    struct MuteProbe {
        pushed: Arc<Mutex<Vec<Vec<f32>>>>,
        cuts: Arc<AtomicU64>,
    }

    impl crate::transcription::pipeline::StreamingAsr for MuteProbe {
        fn push_mono(
            &mut self,
            samples: &[f32],
        ) -> anyhow::Result<Option<crate::transcription::pipeline::AsrOutput>> {
            self.pushed.lock().unwrap().push(samples.to_vec());
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
                committed: vec![word("before mute", 0.0, 1.0)],
                tentative: Vec::new(),
            }))
        }
    }

    fn wait_for_pushed(pushed: &Arc<Mutex<Vec<Vec<f32>>>>, count: usize) {
        let started = std::time::Instant::now();
        while pushed.lock().unwrap().len() < count {
            assert!(
                started.elapsed() < std::time::Duration::from_secs(2),
                "worker did not push chunk {count}"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }

    #[test]
    fn a_muted_meeting_app_silences_the_mic_and_releases_on_unmute() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(1);
        let pushed = Arc::new(Mutex::new(Vec::new()));
        let cuts = Arc::new(AtomicU64::new(0));
        let events = Arc::new(Mutex::new(Vec::new()));
        let events_emit = events.clone();
        let muted = Arc::new(AtomicBool::new(false));
        let gate_flag = muted.clone();
        let pipeline = StreamingPipeline::new(Box::new(MuteProbe {
            pushed: pushed.clone(),
            cuts: cuts.clone(),
        }));
        let handle = std::thread::spawn(move || {
            run_worker(
                rx,
                pipeline,
                mic_labels(),
                move |event| events_emit.lock().unwrap().push(event),
                Arc::new(AtomicBool::new(false)),
                Arc::new(AtomicU64::new(0)),
                None,
                None,
                Some(MicMuteGate::new(move || gate_flag.load(Ordering::Relaxed))),
            );
        });

        tx.send(vec![0.5; 480]).unwrap();
        wait_for_pushed(&pushed, 1);

        muted.store(true, Ordering::Relaxed);
        // Longer than the silence-permission check, so a false banner would show.
        tx.send(vec![0.5; 48_000]).unwrap();
        wait_for_pushed(&pushed, 2);

        muted.store(false, Ordering::Relaxed);
        tx.send(vec![0.5; 480]).unwrap();
        wait_for_pushed(&pushed, 3);
        drop(tx);
        handle.join().unwrap();

        let pushed = pushed.lock().unwrap();
        assert_eq!(pushed[0].len(), 480);
        assert!(pushed[0].iter().all(|sample| *sample == 0.5));
        assert_eq!(pushed[1].len(), 48_000, "muted audio keeps its length");
        assert!(pushed[1].iter().all(|sample| *sample == 0.0));
        assert!(pushed[2].iter().all(|sample| *sample == 0.5));
        assert_eq!(cuts.load(Ordering::Relaxed), 1, "cut once, on the mute edge");

        let events = events.lock().unwrap();
        assert!(events.iter().any(|event| matches!(
            event,
            TranscriptEvent::Commit(commit) if commit.text == "before mute"
        )));
        assert!(
            !events
                .iter()
                .any(|event| matches!(event, TranscriptEvent::Status(_))),
            "a muted mic must not raise the silent-microphone banner"
        );
        let flags: Vec<bool> = events
            .iter()
            .filter_map(|event| match event {
                TranscriptEvent::MicLevel(level) => Some(level.muted),
                _ => None,
            })
            .collect();
        assert_eq!(
            flags,
            vec![false, true, false],
            "the mic icon sees muted only for the muted chunk"
        );
    }

    #[test]
    fn the_gate_never_touches_the_system_stream() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Vec<f32>>(1);
        let pushed = Arc::new(Mutex::new(Vec::new()));
        let pipeline = StreamingPipeline::new(Box::new(MuteProbe {
            pushed: pushed.clone(),
            cuts: Arc::new(AtomicU64::new(0)),
        }));
        tx.send(vec![0.5; 16]).unwrap();
        drop(tx);
        run_worker(
            rx,
            pipeline,
            StreamLabels {
                speaker: labels::REMOTE,
                stream: labels::SYSTEM_STREAM,
            },
            |_| {},
            Arc::new(AtomicBool::new(false)),
            Arc::new(AtomicU64::new(0)),
            None,
            None,
            Some(MicMuteGate::new(|| true)),
        );
        assert!(pushed.lock().unwrap()[0].iter().all(|sample| *sample == 0.5));
    }

    mod speaker_cuts {
        use super::super::SpeakerCuts;
        use std::sync::atomic::{AtomicU64, Ordering};
        use std::sync::Arc;

        const RATE: u32 = 16_000;
        /// 10 ms chunks.
        const CHUNK: usize = RATE as usize / 100;

        fn speech() -> Vec<f32> {
            vec![0.2; CHUNK]
        }

        fn quiet() -> Vec<f32> {
            vec![0.0; CHUNK]
        }

        /// Chunks fed until the cut fires, or `None` within `limit` chunks.
        fn chunks_until_cut(
            cuts: &mut SpeakerCuts,
            mut next: impl FnMut(usize) -> Vec<f32>,
            limit: usize,
        ) -> Option<usize> {
            (1..=limit).find(|&index| cuts.ready(&next(index)))
        }

        #[test]
        fn nothing_is_cut_without_a_handover() {
            let flag = Arc::new(AtomicU64::new(3));
            let mut cuts = SpeakerCuts::new(flag, RATE);
            assert_eq!(chunks_until_cut(&mut cuts, |_| quiet(), 500), None);
        }

        #[test]
        fn a_handover_during_speech_waits_for_the_pause() {
            let flag = Arc::new(AtomicU64::new(0));
            let mut cuts = SpeakerCuts::new(flag.clone(), RATE);
            flag.fetch_add(1, Ordering::Release);
            // 50 chunks of speech, then quiet: the cut lands 200 ms into the quiet.
            let at = chunks_until_cut(&mut cuts, |i| if i <= 50 { speech() } else { quiet() }, 500);
            assert_eq!(at, Some(50 + 20));
        }

        #[test]
        fn a_short_gap_between_words_is_not_a_pause() {
            let flag = Arc::new(AtomicU64::new(0));
            let mut cuts = SpeakerCuts::new(flag.clone(), RATE);
            flag.fetch_add(1, Ordering::Release);
            // 100 ms gaps every 300 ms never reach the pause, so the max wait decides.
            let at = chunks_until_cut(&mut cuts, |i| if i % 30 < 10 { quiet() } else { speech() }, 500);
            assert_eq!(at, Some(150));
        }

        #[test]
        fn handovers_while_held_collapse_into_one_cut() {
            let flag = Arc::new(AtomicU64::new(0));
            let mut cuts = SpeakerCuts::new(flag.clone(), RATE);
            flag.fetch_add(1, Ordering::Release);
            assert!(!cuts.ready(&speech()));
            flag.fetch_add(1, Ordering::Release);
            assert_eq!(chunks_until_cut(&mut cuts, |_| quiet(), 500), Some(20));
            assert_eq!(chunks_until_cut(&mut cuts, |_| quiet(), 500), None);
        }
    }
}
