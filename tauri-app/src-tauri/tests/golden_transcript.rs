//! Golden transcript tests against test-youtube-video.{txt,mp4}.

use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

use tauri_app_lib::evaluate_wer;
use tauri_app_lib::transcription::{AudioSource, TranscriptionService};

fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn reference_text() -> String {
    fs::read_to_string(app_root().join("test-youtube-video.txt")).expect("reference transcript")
}

#[test]
fn eval_phase1_transcript_against_reference() {
    let root = app_root();
    let hypothesis_path = root.join("test-output/transcript.txt");
    if !hypothesis_path.exists() {
        eprintln!("Skipping: {} not found (run Phase 1 first)", hypothesis_path.display());
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
#[ignore = "requires macOS, WhisperKit helper/model setup, system audio permission, ffplay (~90s)"]
fn golden_system_audio_e2e() {
    if std::env::consts::OS != "macos" {
        eprintln!("Skipping: macOS only");
        return;
    }

    let root = app_root();
    let video = root.join("test-youtube-video.mp4");
    assert!(video.exists(), "missing {}", video.display());

    let service = TranscriptionService::new();
    service
        .start_headless(AudioSource::SystemAudio)
        .expect("start transcription");

    // Model load + loopback setup
    thread::sleep(Duration::from_secs(4));

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

    // Allow VAD flush
    thread::sleep(Duration::from_secs(8));

    let export = service.stop(None).expect("stop transcription");
    assert!(!export.text.is_empty(), "empty transcript");

    let out_path = root.join("test-output/e2e-transcript.txt");
    if let Some(parent) = out_path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&out_path, &export.text).expect("write e2e transcript");

    let report = evaluate_wer(&reference_text(), &export.text);
    println!(
        "E2E WER: {:.1}% (S={} I={} D={} dup_bi={})",
        report.wer * 100.0,
        report.substitutions,
        report.insertions,
        report.deletions,
        report.duplicate_bigram_count
    );

    assert_eq!(report.duplicate_bigram_count, 0, "duplicate bigrams detected");

    let max = std::env::var("GOLDEN_E2E_MAX_WER")
        .ok()
        .map(|raw| raw.parse().expect("GOLDEN_E2E_MAX_WER must be a float"))
        .unwrap_or(0.08);
    assert!(
        report.wer < max,
        "WER {:.1}% exceeds GOLDEN_E2E_MAX_WER={}",
        report.wer * 100.0,
        max
    );
}
