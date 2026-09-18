//! Isolate model quality vs commit strategy vs real-time audio loss.
//!
//! Feeds the golden video through the ASR pipeline from a file (no dropped frames)
//! and compares WER for committed-only vs committed+finish transcripts.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use tauri_app_lib::transcription::AsrWord;
use tauri_app_lib::{evaluate_wer, AppConfig, AsrBackend, LoadedEngine};

fn app_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

fn golden_dataset_root() -> PathBuf {
    app_root().join("golden-dataset")
}

fn reference_text() -> String {
    fs::read_to_string(
        golden_dataset_root()
            .join("transcripts")
            .join("test-youtube-video.txt"),
    )
    .expect("reference transcript")
}

fn ffmpeg_decode_mono_f32(video: &Path, sample_rate: u32) -> Vec<f32> {
    let output = Command::new("ffmpeg")
        .args([
            "-i",
            video.to_str().unwrap(),
            "-ar",
            &sample_rate.to_string(),
            "-ac",
            "1",
            "-f",
            "f32le",
            "-acodec",
            "pcm_f32le",
            "pipe:1",
            "-loglevel",
            "quiet",
        ])
        .output()
        .expect("spawn ffmpeg (install ffmpeg)");

    assert!(
        output.status.success(),
        "ffmpeg failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    output
        .stdout
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect()
}

fn join_words(words: &[AsrWord]) -> String {
    words
        .iter()
        .map(|w| w.text.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}

struct PipelineTranscripts {
    committed_only: String,
    with_finish: String,
    asr_passes: u64,
}

fn transcribe_from_pcm(
    engine: &LoadedEngine,
    sample_rate: u32,
    pcm: &[f32],
    chunk_samples: usize,
) -> PipelineTranscripts {
    let mut pipeline = engine
        .create_pipeline(sample_rate, "system")
        .expect("create pipeline");

    let mut committed_only = String::new();
    let mut asr_passes = 0u64;

    for chunk in pcm.chunks(chunk_samples.max(1)) {
        match pipeline.push_mono(chunk) {
            Ok(Some(output)) => {
                asr_passes += 1;
                if !output.committed.is_empty() {
                    let text = join_words(&output.committed);
                    if !committed_only.is_empty() {
                        committed_only.push(' ');
                    }
                    committed_only.push_str(&text);
                }
            }
            Ok(None) => {}
            Err(e) => panic!("push_mono: {e:#}"),
        }
    }

    let mut with_finish = committed_only.clone();
    let finish = pipeline.finish().expect("finish");
    if !finish.committed.is_empty() {
        let text = join_words(&finish.committed);
        if !with_finish.is_empty() {
            with_finish.push(' ');
        }
        with_finish.push_str(&text);
    }

    PipelineTranscripts {
        committed_only,
        with_finish,
        asr_passes,
    }
}

fn print_wer(label: &str, hypothesis: &str, reference: &str) -> tauri_app_lib::WerReport {
    let report = evaluate_wer(reference, hypothesis);
    println!(
        "  {label:<28} WER {:>5.1}%  words {:>3}  (S={} I={} D={})",
        report.wer * 100.0,
        report.hypothesis_words,
        report.substitutions,
        report.insertions,
        report.deletions
    );
    report
}

#[test]
#[ignore = "requires Nemotron helper/model setup (or ASR_BACKEND=xai + API key) and ffmpeg (~60s+)"]
fn diagnose_model_vs_commit_strategy() {
    let root = app_root();
    let video = golden_dataset_root()
        .join("clips")
        .join("test-youtube-video.mp4");
    assert!(video.exists(), "missing {}", video.display());

    let backend = AsrBackend::from_env();
    let config = AppConfig::load();
    if backend == AsrBackend::Local {
        config.validate().expect("Nemotron setup");
    }
    let engine = LoadedEngine::load(&config, backend).expect("load model");
    println!("ASR backend: {}", backend.as_str());

    // Match typical macOS loopback capture: 48 kHz, ~21 ms cpal callbacks.
    let sample_rate = 48_000u32;
    let chunk_samples = 1024usize;
    let pcm = ffmpeg_decode_mono_f32(&video, sample_rate);

    println!("\n=== File pipeline (no audio drops) ===");
    println!(
        "  audio: {:.1}s @ {} Hz, chunk {} samples",
        pcm.len() as f64 / sample_rate as f64,
        sample_rate,
        chunk_samples
    );

    let file = transcribe_from_pcm(&engine, sample_rate, &pcm, chunk_samples);
    println!("  ASR passes: {}", file.asr_passes);

    let reference = reference_text();
    let out_dir = root.join("test-output/diagnostic");
    fs::create_dir_all(&out_dir).ok();

    let suffix = backend.as_str();
    fs::write(
        out_dir.join(format!("file-committed-only-{suffix}.txt")),
        &file.committed_only,
    )
    .ok();
    fs::write(
        out_dir.join(format!("file-with-finish-{suffix}.txt")),
        &file.with_finish,
    )
    .ok();
    if backend == AsrBackend::Local {
        fs::write(
            out_dir.join("file-committed-only.txt"),
            &file.committed_only,
        )
        .ok();
        fs::write(out_dir.join("file-with-finish.txt"), &file.with_finish).ok();
    }

    println!("\n--- WER vs reference ---");
    let file_committed = print_wer("file committed-only", &file.committed_only, &reference);
    let file_finished = print_wer("file committed+finish", &file.with_finish, &reference);

    let commit_delta = file_finished.wer - file_committed.wer;
    println!(
        "\n  commit-strategy gap (finish flush): {:+.2}% WER",
        commit_delta * 100.0
    );

    let phase1_path = root.join("test-output/transcript.txt");
    if phase1_path.exists() {
        let phase1 = fs::read_to_string(&phase1_path).expect("phase1");
        let phase1_report = print_wer("Phase 1 UI (system audio)", &phase1, &reference);
        println!(
            "\n  UI vs file committed-only: {:+.2}% WER (positive = UI worse)",
            (phase1_report.wer - file_committed.wer) * 100.0
        );
    }

    let e2e_path = root.join("test-output/e2e-transcript.txt");
    if e2e_path.exists() {
        let e2e = fs::read_to_string(&e2e_path).expect("e2e");
        let e2e_report = print_wer("previous E2E headless", &e2e, &reference);
        println!(
            "\n  E2E vs file committed-only: {:+.2}% WER (positive = E2E worse / audio loss)",
            (e2e_report.wer - file_committed.wer) * 100.0
        );
    }

    assert!(!file.with_finish.is_empty(), "empty transcript from {}", backend.as_str());
    if backend == AsrBackend::Local {
        assert!(
            file_finished.wer < 0.05,
            "file pipeline WER exceeds the 5% product gate"
        );
    }
}
