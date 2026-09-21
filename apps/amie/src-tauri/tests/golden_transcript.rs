//! Golden transcript tests against golden-dataset clips and reference transcripts.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use amie_lib::config::AppConfig;
use amie_lib::evaluate_wer;
use amie_lib::transcription::{capture_stats, AsrBackend, AudioSource, TranscriptionService};

/// Default WER gate for headless E2E golden test (fraction, not percent).
const DEFAULT_GOLDEN_E2E_MAX_WER: f64 = 0.05;

fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

fn golden_dataset_root() -> PathBuf {
    app_root().join("golden-dataset")
}

fn golden_clip_name() -> String {
    std::env::var("GOLDEN_CLIP").unwrap_or_else(|_| "test-youtube-video".into())
}

fn reference_text() -> String {
    fs::read_to_string(
        golden_dataset_root()
            .join("transcripts")
            .join(format!("{}.txt", golden_clip_name())),
    )
    .expect("reference transcript")
}

fn video_duration_secs(video: &PathBuf) -> f64 {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            video.to_str().unwrap(),
        ])
        .output()
        .expect("spawn ffprobe");
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse()
        .unwrap_or(0.0)
}

#[test]
fn eval_phase1_transcript_against_reference() {
    let root = app_root();
    let hypothesis_path = root.join("test-output/transcript.txt");
    if !hypothesis_path.exists() {
        eprintln!(
            "Skipping: {} not found (run Phase 1 first)",
            hypothesis_path.display()
        );
        return;
    }

    let hypothesis = fs::read_to_string(&hypothesis_path).expect("hypothesis");
    let report = evaluate_wer(&reference_text(), &hypothesis);

    println!(
        "Phase 1 WER: {:.1}% (S={} I={} D={})",
        report.wer * 100.0,
        report.substitutions,
        report.insertions,
        report.deletions
    );

    assert!(report.reference_words > 0);
    assert!(report.hypothesis_words > 0);
    // Sanity bound — tighten once pipeline improves.
    assert!(report.wer < 0.60, "WER unexpectedly high: {}", report.wer);
}

#[test]
#[ignore = "requires macOS, Nemotron helper/model setup, system audio permission, ffplay (~90s)"]
fn golden_system_audio_e2e() {
    if std::env::consts::OS != "macos" {
        eprintln!("Skipping: macOS only");
        return;
    }

    let clip = golden_clip_name();
    let root = app_root();
    let video = golden_dataset_root()
        .join("clips")
        .join(format!("{clip}.mp4"));
    assert!(video.exists(), "missing {}", video.display());

    let config = AppConfig::load();
    let backend = AsrBackend::from_env();
    if backend == AsrBackend::Local {
        config.validate().unwrap_or_else(|err| {
            panic!("Nemotron cache incomplete: {err}\nRun: apps/amie/scripts/setup-nemotron.sh");
        });
    } else {
        println!("E2E ASR backend: {}", backend.as_str());
    }

    let t0 = Instant::now();
    let service = TranscriptionService::new();
    service
        .start_headless(AudioSource::SystemAudio)
        .expect("start transcription");
    let model_and_capture_start_s = t0.elapsed().as_secs_f64();

    // Model load + loopback setup
    thread::sleep(Duration::from_secs(4));
    let pre_roll_s = 4.0_f64;

    let t_ffplay = Instant::now();
    let mut child = Command::new("ffplay")
        .args([
            "-autoexit",
            "-nodisp",
            "-loglevel",
            "quiet",
            video.to_str().unwrap(),
        ])
        .spawn()
        .expect("spawn ffplay");

    let status = child.wait().expect("wait for ffplay");
    assert!(status.success(), "ffplay failed: {status}");
    let ffplay_s = t_ffplay.elapsed().as_secs_f64();

    // Allow VAD flush
    thread::sleep(Duration::from_secs(8));
    let post_roll_s = 8.0_f64;

    let t_stop = Instant::now();
    let export = service.stop(None).expect("stop transcription");
    let stop_join_s = t_stop.elapsed().as_secs_f64();
    assert!(!export.text.is_empty(), "empty transcript");

    let out_path = root.join("test-output/e2e-transcript.txt");
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&out_path, &export.text).expect("write e2e transcript");

    let report = evaluate_wer(&reference_text(), &export.text);
    let (captured_samples, dropped_samples, dropped_frames) = capture_stats();
    let video_duration_s = video_duration_secs(&video);
    let expected_samples = (video_duration_s * 48_000.0) as u64;
    let captured_s = captured_samples as f64 / 48_000.0;
    let design_window_s = pre_roll_s + video_duration_s + post_roll_s;
    let overrun_vs_video_s = captured_s - video_duration_s;
    let overrun_vs_design_s = captured_s - design_window_s;

    println!("E2E clip: {clip}");
    println!(
        "E2E timing: model+capture_start={model_and_capture_start_s:.1}s pre_roll={pre_roll_s:.1}s ffplay={ffplay_s:.1}s post_roll={post_roll_s:.1}s stop_join={stop_join_s:.1}s"
    );
    println!(
        "E2E capture window: captured={captured_s:.1}s video={video_duration_s:.1}s design={design_window_s:.1}s overrun_vs_video={overrun_vs_video_s:+.1}s overrun_vs_design={overrun_vs_design_s:+.1}s"
    );

    println!(
        "E2E WER: {:.1}% (S={} I={} D={} dup_bi={})",
        report.wer * 100.0,
        report.substitutions,
        report.insertions,
        report.deletions,
        report.duplicate_bigram_count
    );
    println!(
        "E2E capture: captured={} dropped={} frames_dropped={} expected≈{} ({:.1}s@48kHz)",
        captured_samples,
        dropped_samples,
        dropped_frames,
        expected_samples,
        captured_samples as f64 / 48_000.0
    );

    assert_eq!(
        report.duplicate_bigram_count, 0,
        "duplicate bigrams detected"
    );

    let max = std::env::var("GOLDEN_E2E_MAX_WER")
        .ok()
        .map(|raw| raw.parse().expect("GOLDEN_E2E_MAX_WER must be a float"))
        .unwrap_or(DEFAULT_GOLDEN_E2E_MAX_WER);
    assert!(
        report.wer < max,
        "WER {:.1}% exceeds GOLDEN_E2E_MAX_WER={}",
        report.wer * 100.0,
        max
    );
}
