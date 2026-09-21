//! File-pipeline transcription for eval scripts.
//!
//! Loads Nemotron once, then transcribes every WAV in a JSON manifest.
//!
//! ```text
//! cargo run --manifest-path src-tauri/Cargo.toml --bin file_transcribe -- \
//!   --manifest meetings.json --out-dir out/local
//! ```

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Instant;

use serde::Deserialize;
use amie_lib::transcription::AsrWord;
use amie_lib::{AppConfig, AsrBackend, LoadedEngine};

const SAMPLE_RATE: u32 = 48_000;
const CHUNK_SAMPLES: usize = 1024;

#[derive(Debug, Deserialize)]
struct ManifestItem {
    id: String,
    audio: PathBuf,
}

struct Args {
    manifest: PathBuf,
    out_dir: PathBuf,
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn")),
        )
        .init();

    let args = parse_args();
    let items: Vec<ManifestItem> = serde_json::from_str(
        &fs::read_to_string(&args.manifest).unwrap_or_else(|e| {
            panic!("read manifest {}: {e}", args.manifest.display());
        }),
    )
    .unwrap_or_else(|e| panic!("parse manifest JSON: {e}"));

    if items.is_empty() {
        eprintln!("manifest is empty: {}", args.manifest.display());
        std::process::exit(1);
    }

    fs::create_dir_all(&args.out_dir).unwrap_or_else(|e| {
        panic!("create out-dir {}: {e}", args.out_dir.display());
    });

    let config = AppConfig::load();
    config.validate().unwrap_or_else(|e| panic!("Nemotron setup: {e}"));
    let engine = LoadedEngine::load(&config, AsrBackend::Local)
        .unwrap_or_else(|e| panic!("load models: {e:#}"));
    eprintln!("file_transcribe: loaded {}", engine.model_name);

    let mut failures = 0usize;
    for (i, item) in items.iter().enumerate() {
        let started = Instant::now();
        eprintln!(
            "[{}/{}] {}  {}",
            i + 1,
            items.len(),
            item.id,
            item.audio.display()
        );
        match transcribe_one(&engine, &item.audio) {
            Ok(text) => {
                let out = args.out_dir.join(format!("{}.txt", item.id));
                fs::write(&out, &text).unwrap_or_else(|e| panic!("write {}: {e}", out.display()));
                eprintln!(
                    "  wrote {} ({} words, {:.1}s)",
                    out.display(),
                    text.split_whitespace().count(),
                    started.elapsed().as_secs_f64()
                );
            }
            Err(err) => {
                failures += 1;
                eprintln!("  ERROR {}: {err:#}", item.id);
            }
        }
    }

    if failures > 0 {
        eprintln!("file_transcribe: {failures}/{} meetings failed", items.len());
        std::process::exit(1);
    }
}

fn transcribe_one(engine: &LoadedEngine, audio: &Path) -> anyhow::Result<String> {
    anyhow::ensure!(audio.exists(), "missing audio {}", audio.display());
    let pcm = ffmpeg_decode_mono_f32(audio, SAMPLE_RATE)?;
    let mut pipeline = engine.create_pipeline(SAMPLE_RATE, "system")?;

    let mut committed = String::new();
    for chunk in pcm.chunks(CHUNK_SAMPLES.max(1)) {
        if let Some(output) = pipeline.push_mono(chunk)? {
            append_words(&mut committed, &output.committed);
        }
    }

    let finish = pipeline.finish()?;
    append_words(&mut committed, &finish.committed);
    anyhow::ensure!(!committed.is_empty(), "empty transcript");
    Ok(committed)
}

fn append_words(dst: &mut String, words: &[AsrWord]) {
    if words.is_empty() {
        return;
    }
    let text = words
        .iter()
        .map(|w| w.text.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    if !dst.is_empty() {
        dst.push(' ');
    }
    dst.push_str(&text);
}

fn ffmpeg_decode_mono_f32(audio: &Path, sample_rate: u32) -> anyhow::Result<Vec<f32>> {
    let output = Command::new("ffmpeg")
        .args([
            "-i",
            audio.to_str().ok_or_else(|| anyhow::anyhow!("non-utf8 audio path"))?,
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
            "error",
        ])
        .output()
        .map_err(|e| anyhow::anyhow!("spawn ffmpeg (install ffmpeg): {e}"))?;

    if !output.status.success() {
        anyhow::bail!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    Ok(output
        .stdout
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

fn parse_args() -> Args {
    let mut manifest = None;
    let mut out_dir = None;
    let mut argv = std::env::args().skip(1);
    while let Some(arg) = argv.next() {
        match arg.as_str() {
            "--manifest" => {
                manifest = Some(PathBuf::from(argv.next().expect("--manifest needs a value")));
            }
            "--out-dir" => {
                out_dir = Some(PathBuf::from(argv.next().expect("--out-dir needs a value")));
            }
            "--backend" => {
                let value = argv.next().expect("--backend needs a value");
                if value.trim().to_ascii_lowercase() != "local" {
                    eprintln!("file_transcribe only supports --backend local (got {value})");
                    std::process::exit(2);
                }
            }
            "-h" | "--help" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                eprintln!("unknown argument: {other}");
                print_help();
                std::process::exit(2);
            }
        }
    }

    Args {
        manifest: manifest.unwrap_or_else(|| {
            eprintln!("missing --manifest");
            print_help();
            std::process::exit(2);
        }),
        out_dir: out_dir.unwrap_or_else(|| {
            eprintln!("missing --out-dir");
            print_help();
            std::process::exit(2);
        }),
    }
}

fn print_help() {
    eprintln!(
        "Usage: file_transcribe --manifest <meetings.json> --out-dir <dir> [--backend local]"
    );
}
