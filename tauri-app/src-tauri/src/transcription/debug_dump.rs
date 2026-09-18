use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use hound::{SampleFormat, WavSpec, WavWriter};
use serde::{Deserialize, Serialize};

use crate::config::AppConfig;
use crate::ipc::transcript::TranscriptCommit;
use crate::transcription::audio_source::AudioSource;

const DEBUG_SAVE_ENV: &str = "DEBUG_SAVE";

/// TEMPORARY: after each DEBUG_SAVE session, run merge-session-transcript.py
/// into ~/Downloads. Remove once proper export UX lands.
#[cfg(not(test))]
const TEMP_AUTO_EXPORT_MERGED_TO_DOWNLOADS: bool = true;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SegmentRecord {
    segment_id: String,
    speaker: String,
    text: String,
    start_ms: u64,
    end_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimingRecord {
    segment_id: String,
    push_mono_duration_ms: f64,
    chunk_samples: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamTimingStats {
    stream: String,
    records: Vec<TimingRecord>,
    total_push_mono_duration_ms: f64,
    avg_push_mono_duration_ms: f64,
    max_push_mono_duration_ms: f64,
    push_mono_call_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TimingFile {
    streams: Vec<StreamTimingStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamMeta {
    stream: String,
    device_name: String,
    sample_rate: u32,
    total_samples: u64,
    duration_secs: f64,
    captured_samples: u64,
    dropped_samples: u64,
    dropped_frames: u64,
    commit_count: usize,
    audio_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionMeta {
    session_id: String,
    started_at: String,
    stopped_at: String,
    source: String,
    model: String,
    streams: Vec<StreamMeta>,
}

#[derive(Debug, Clone)]
pub struct StreamCaptureStats {
    pub captured_samples: u64,
    pub dropped_samples: u64,
    pub dropped_frames: u64,
}

/// Hooks the transcription worker calls to observe stream activity (audio, ASR, commits).
pub trait StreamObserver: Send {
    fn on_audio(&mut self, samples: &[f32]);
    fn on_asr_pass(&mut self, label: &str, elapsed: Duration, chunk_samples: usize);
    fn on_commit(&mut self, commit: &TranscriptCommit);
    fn on_finished(self: Box<Self>);
}

#[derive(Debug, Clone)]
struct StreamSummary {
    stream: String,
    device_name: String,
    sample_rate: u32,
    total_samples: u64,
    commit_count: usize,
    wav_path: PathBuf,
    timing: Vec<TimingRecord>,
}

pub fn debug_save_enabled() -> bool {
    std::env::var(DEBUG_SAVE_ENV)
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"))
}

pub fn debug_root_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has parent")
        .join("debug")
}

fn session_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO);
    let secs = now.as_secs();
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;

    let mut year = 1970i32;
    let mut days_left = days as i64;

    loop {
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        let year_days = if leap { 366 } else { 365 };
        if days_left < year_days {
            break;
        }
        days_left -= year_days;
        year += 1;
    }

    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u32;
    for days_in_month in month_days {
        if days_left < days_in_month as i64 {
            break;
        }
        days_left -= days_in_month as i64;
        month += 1;
    }
    let day = days_left as u32 + 1;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}-{minute:02}-{second:02}")
}

fn iso_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO);
    let secs = now.as_secs();
    let nanos = now.subsec_nanos();
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;

    let mut year = 1970i32;
    let mut days_left = days as i64;

    loop {
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        let year_days = if leap { 366 } else { 365 };
        if days_left < year_days {
            break;
        }
        days_left -= year_days;
        year += 1;
    }

    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut month = 1u32;
    for days_in_month in month_days {
        if days_left < days_in_month as i64 {
            break;
        }
        days_left -= days_in_month as i64;
        month += 1;
    }
    let day = days_left as u32 + 1;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{nanos:09}Z")
}

pub struct DebugSession {
    session_id: String,
    started_at: String,
    source: AudioSource,
    model: String,
    dir: PathBuf,
    summaries: Arc<Mutex<Vec<StreamSummary>>>,
    stream_stats: Arc<Mutex<Vec<(String, StreamCaptureStats)>>>,
}

impl DebugSession {
    pub fn try_open(source: AudioSource, _config: &AppConfig) -> Option<Self> {
        if !debug_save_enabled() {
            return None;
        }

        let session_id = session_timestamp();
        let dir = debug_root_dir().join(&session_id);
        if let Err(err) = fs::create_dir_all(&dir) {
            tracing::warn!(
                error = %err,
                dir = %dir.display(),
                "Failed to create debug session directory; debug dump disabled"
            );
            return None;
        }

        tracing::info!(
            session_id = %session_id,
            dir = %dir.display(),
            "Debug session dump enabled"
        );

        Some(Self {
            session_id,
            started_at: iso_timestamp(),
            source,
            model: crate::transcription::nemotron::MODEL_DISPLAY_NAME.to_string(),
            dir,
            summaries: Arc::new(Mutex::new(Vec::new())),
            stream_stats: Arc::new(Mutex::new(Vec::new())),
        })
    }

    pub fn record_capture_stats(&self, stream: &str, stats: StreamCaptureStats) {
        self.stream_stats
            .lock()
            .unwrap()
            .push((stream.to_string(), stats));
    }

    pub fn open_stream_writer(
        &self,
        stream: &str,
        device_name: String,
        sample_rate: u32,
    ) -> Option<DebugStreamWriter> {
        let wav_path = self.dir.join(format!("{stream}.wav"));
        let writer = match WavWriter::create(
            &wav_path,
            WavSpec {
                channels: 1,
                sample_rate,
                bits_per_sample: 16,
                sample_format: SampleFormat::Int,
            },
        ) {
            Ok(writer) => writer,
            Err(err) => {
                tracing::warn!(
                    error = %err,
                    stream,
                    path = %wav_path.display(),
                    "Failed to open debug WAV writer"
                );
                return None;
            }
        };

        Some(DebugStreamWriter {
            stream: stream.to_string(),
            device_name,
            sample_rate,
            dir: self.dir.clone(),
            wav_path,
            wav_writer: Some(writer),
            segments: Vec::new(),
            timing: Vec::new(),
            total_samples: 0,
            summaries: self.summaries.clone(),
            finished: false,
        })
    }

    pub fn open_stream_observer(
        &self,
        stream: &str,
        device_name: String,
        sample_rate: u32,
    ) -> Option<Box<dyn StreamObserver>> {
        self.open_stream_writer(stream, device_name, sample_rate)
            .map(|writer| Box::new(writer) as Box<dyn StreamObserver>)
    }

    pub fn finalize(&self) -> Vec<PathBuf> {
        let summaries = self.summaries.lock().unwrap().clone();
        let stream_stats = self.stream_stats.lock().unwrap().clone();
        let stopped_at = iso_timestamp();
        let mut wav_paths = Vec::new();

        let timing_streams: Vec<StreamTimingStats> = summaries
            .iter()
            .map(|summary| build_timing_stats(&summary.stream, &summary.timing))
            .collect();

        let stats_by_stream: std::collections::HashMap<String, StreamCaptureStats> = stream_stats
            .into_iter()
            .map(|(stream, stats)| (stream, stats))
            .collect();

        let streams: Vec<StreamMeta> = summaries
            .into_iter()
            .map(|summary| {
                wav_paths.push(summary.wav_path.clone());
                let stats = stats_by_stream.get(&summary.stream);
                let duration_secs = summary.total_samples as f64 / summary.sample_rate as f64;
                StreamMeta {
                    stream: summary.stream.clone(),
                    device_name: summary.device_name,
                    sample_rate: summary.sample_rate,
                    total_samples: summary.total_samples,
                    duration_secs,
                    captured_samples: stats.map(|s| s.captured_samples).unwrap_or(0),
                    dropped_samples: stats.map(|s| s.dropped_samples).unwrap_or(0),
                    dropped_frames: stats.map(|s| s.dropped_frames).unwrap_or(0),
                    commit_count: summary.commit_count,
                    audio_file: format!("{}.flac", summary.stream),
                }
            })
            .collect();

        let meta = SessionMeta {
            session_id: self.session_id.clone(),
            started_at: self.started_at.clone(),
            stopped_at: stopped_at.clone(),
            source: self.source.as_str().to_string(),
            model: self.model.clone(),
            streams,
        };

        let timing = TimingFile {
            streams: timing_streams,
        };

        if let Err(err) = write_json(&self.dir.join("meta.json"), &meta) {
            tracing::warn!(error = %err, "Failed to write debug meta.json");
        }
        if let Err(err) = write_json(&self.dir.join("timing.json"), &timing) {
            tracing::warn!(error = %err, "Failed to write debug timing.json");
        }

        tracing::info!(
            session_id = %self.session_id,
            dir = %self.dir.display(),
            wav_files = wav_paths.len(),
            "Debug session finalized"
        );

        // Skip in unit tests to avoid writing into ~/Downloads.
        #[cfg(not(test))]
        if TEMP_AUTO_EXPORT_MERGED_TO_DOWNLOADS {
            export_merged_transcript_to_downloads(&self.dir);
        }

        wav_paths
    }
}

#[cfg(not(test))]
fn merge_script_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has parent")
        .join("scripts/merge-session-transcript.py")
}

#[cfg(not(test))]
fn export_merged_transcript_to_downloads(session_dir: &Path) {
    use std::process::Command;

    let script = merge_script_path();
    if !script.exists() {
        tracing::warn!(
            script = %script.display(),
            "Temporary merge export skipped; script not found"
        );
        return;
    }

    let python = ["/usr/bin/python3", "python3"]
        .into_iter()
        .find(|bin| Command::new(bin).arg("--version").output().is_ok())
        .unwrap_or("python3");

    match Command::new(python)
        .arg(&script)
        .arg(session_dir)
        .arg("--to-downloads")
        .output()
    {
        Ok(output) if output.status.success() => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            tracing::info!(
                session_dir = %session_dir.display(),
                detail = %stderr.trim(),
                "Temporary merge export wrote transcript to ~/Downloads"
            );
        }
        Ok(output) => {
            tracing::warn!(
                status = %output.status,
                stderr = %String::from_utf8_lossy(&output.stderr).trim(),
                stdout = %String::from_utf8_lossy(&output.stdout).trim(),
                session_dir = %session_dir.display(),
                "Temporary merge export failed"
            );
        }
        Err(err) => {
            tracing::warn!(
                error = %err,
                session_dir = %session_dir.display(),
                "Temporary merge export could not start python"
            );
        }
    }
}

pub struct DebugStreamWriter {
    stream: String,
    device_name: String,
    sample_rate: u32,
    dir: PathBuf,
    wav_path: PathBuf,
    wav_writer: Option<WavWriter<BufWriter<File>>>,
    segments: Vec<SegmentRecord>,
    timing: Vec<TimingRecord>,
    total_samples: u64,
    summaries: Arc<Mutex<Vec<StreamSummary>>>,
    finished: bool,
}

impl DebugStreamWriter {
    pub fn append_audio(&mut self, samples: &[f32]) {
        let Some(writer) = self.wav_writer.as_mut() else {
            return;
        };

        for &sample in samples {
            let clamped = sample.clamp(-1.0, 1.0);
            let int_sample = (clamped * i16::MAX as f32).round() as i16;
            if let Err(err) = writer.write_sample(int_sample) {
                tracing::warn!(
                    error = %err,
                    stream = %self.stream,
                    "Failed to write debug audio sample"
                );
                self.wav_writer = None;
                return;
            }
        }
        self.total_samples += samples.len() as u64;
    }

    pub fn record_segment(&mut self, commit: &TranscriptCommit) {
        self.segments.push(SegmentRecord {
            segment_id: commit.segment_id.clone(),
            speaker: commit.speaker.clone(),
            text: commit.text.clone(),
            start_ms: commit.start_ms,
            end_ms: commit.end_ms,
        });
    }

    pub fn record_timing(&mut self, segment_id: &str, elapsed: Duration, chunk_samples: usize) {
        self.timing.push(TimingRecord {
            segment_id: segment_id.to_string(),
            push_mono_duration_ms: elapsed.as_secs_f64() * 1000.0,
            chunk_samples,
        });
    }

    pub fn finish(mut self) -> Option<PathBuf> {
        if self.finished {
            return Some(self.wav_path.clone());
        }
        self.finished = true;

        if let Some(writer) = self.wav_writer.take() {
            if let Err(err) = writer.finalize() {
                tracing::warn!(
                    error = %err,
                    stream = %self.stream,
                    "Failed to finalize debug WAV"
                );
            }
        }

        let text_path = self.dir.join(format!("{}.txt", self.stream));
        let segments_path = self.dir.join(format!("{}.segments.json", self.stream));
        let plain_text = self
            .segments
            .iter()
            .map(|segment| segment.text.as_str())
            .collect::<Vec<_>>()
            .join(" ");

        if let Err(err) = fs::write(&text_path, &plain_text) {
            tracing::warn!(
                error = %err,
                path = %text_path.display(),
                "Failed to write debug transcript text"
            );
        }
        if let Err(err) = write_json(&segments_path, &self.segments) {
            tracing::warn!(
                error = %err,
                path = %segments_path.display(),
                "Failed to write debug segments JSON"
            );
        }

        let summary = StreamSummary {
            stream: self.stream.clone(),
            device_name: self.device_name.clone(),
            sample_rate: self.sample_rate,
            total_samples: self.total_samples,
            commit_count: self.segments.len(),
            wav_path: self.wav_path.clone(),
            timing: self.timing.clone(),
        };
        self.summaries.lock().unwrap().push(summary);

        Some(self.wav_path)
    }
}

impl StreamObserver for DebugStreamWriter {
    fn on_audio(&mut self, samples: &[f32]) {
        self.append_audio(samples);
    }

    fn on_asr_pass(&mut self, label: &str, elapsed: Duration, chunk_samples: usize) {
        self.record_timing(label, elapsed, chunk_samples);
    }

    fn on_commit(&mut self, commit: &TranscriptCommit) {
        self.record_segment(commit);
    }

    fn on_finished(self: Box<Self>) {
        let _ = self.finish();
    }
}

fn build_timing_stats(stream: &str, records: &[TimingRecord]) -> StreamTimingStats {
    let total_push_mono_duration_ms: f64 = records.iter().map(|r| r.push_mono_duration_ms).sum();
    let max_push_mono_duration_ms = records
        .iter()
        .map(|r| r.push_mono_duration_ms)
        .fold(0.0_f64, f64::max);
    let push_mono_call_count = records.len();
    let avg_push_mono_duration_ms = if push_mono_call_count == 0 {
        0.0
    } else {
        total_push_mono_duration_ms / push_mono_call_count as f64
    };

    StreamTimingStats {
        stream: stream.to_string(),
        records: records.to_vec(),
        total_push_mono_duration_ms,
        avg_push_mono_duration_ms,
        max_push_mono_duration_ms,
        push_mono_call_count,
    }
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> std::io::Result<()> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
    let mut file = File::create(path)?;
    file.write_all(json.as_bytes())?;
    file.write_all(b"\n")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use hound::WavReader;

    #[test]
    fn debug_save_enabled_reads_env_var() {
        std::env::set_var(DEBUG_SAVE_ENV, "1");
        assert!(debug_save_enabled());
        std::env::remove_var(DEBUG_SAVE_ENV);
        assert!(!debug_save_enabled());
    }

    #[test]
    fn debug_stream_writer_writes_wav_txt_and_segments() {
        let dir = std::env::temp_dir().join(format!("debug-dump-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let summaries = Arc::new(Mutex::new(Vec::new()));
        let wav_path = dir.join("mic.wav");
        let writer = WavWriter::create(
            &wav_path,
            WavSpec {
                channels: 1,
                sample_rate: 8_000,
                bits_per_sample: 16,
                sample_format: SampleFormat::Int,
            },
        )
        .unwrap();

        let mut debug_writer = DebugStreamWriter {
            stream: "mic".into(),
            device_name: "Test Mic".into(),
            sample_rate: 8_000,
            dir: dir.clone(),
            wav_path: wav_path.clone(),
            wav_writer: Some(writer),
            segments: Vec::new(),
            timing: Vec::new(),
            total_samples: 0,
            summaries: summaries.clone(),
            finished: false,
        };

        debug_writer.append_audio(&[0.0, 0.5, -0.5, 1.0]);
        debug_writer.record_segment(&TranscriptCommit {
            speaker: "User".into(),
            stream: "mic".into(),
            text: "hello world".into(),
            start_ms: 0,
            end_ms: 500,
            segment_id: "seg-0".into(),
        });
        debug_writer.record_timing("seg-0", Duration::from_millis(12), 4);

        let returned_path = debug_writer.finish().unwrap();
        assert_eq!(returned_path, wav_path);
        assert!(wav_path.exists());

        let txt = fs::read_to_string(dir.join("mic.txt")).unwrap();
        assert_eq!(txt, "hello world");

        let segments_json: Vec<SegmentRecord> =
            serde_json::from_str(&fs::read_to_string(dir.join("mic.segments.json")).unwrap())
                .unwrap();
        assert_eq!(segments_json.len(), 1);
        assert_eq!(segments_json[0].text, "hello world");

        let reader = WavReader::open(&wav_path).unwrap();
        assert_eq!(reader.spec().sample_rate, 8_000);
        assert_eq!(reader.len(), 4);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn debug_session_finalize_writes_meta_and_timing() {
        let dir = std::env::temp_dir().join(format!("debug-session-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let session = DebugSession {
            session_id: "2026-06-29T19-47-30".into(),
            started_at: "2026-06-29T19:47:30.000000000Z".into(),
            source: AudioSource::Mic,
            model: crate::transcription::nemotron::MODEL_DISPLAY_NAME.to_string(),
            dir: dir.clone(),
            summaries: Arc::new(Mutex::new(vec![StreamSummary {
                stream: "mic".into(),
                device_name: "Test Mic".into(),
                sample_rate: 48_000,
                total_samples: 48_000,
                commit_count: 1,
                wav_path: dir.join("mic.wav"),
                timing: vec![TimingRecord {
                    segment_id: "seg-0".into(),
                    push_mono_duration_ms: 10.0,
                    chunk_samples: 1024,
                }],
            }])),
            stream_stats: Arc::new(Mutex::new(vec![(
                "mic".into(),
                StreamCaptureStats {
                    captured_samples: 48_000,
                    dropped_samples: 0,
                    dropped_frames: 0,
                },
            )])),
        };

        let wav_paths = session.finalize();

        assert_eq!(wav_paths.len(), 1);
        assert!(dir.join("meta.json").exists());
        assert!(dir.join("timing.json").exists());

        let meta: SessionMeta =
            serde_json::from_str(&fs::read_to_string(dir.join("meta.json")).unwrap()).unwrap();
        assert_eq!(meta.session_id, "2026-06-29T19-47-30");
        assert_eq!(meta.streams[0].audio_file, "mic.flac");

        let _ = fs::remove_dir_all(&dir);
    }
}
