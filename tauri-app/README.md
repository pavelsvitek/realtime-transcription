# Tauri Transcription App

Real-time speech-to-text transcription using [yamabiko-whisper](https://crates.io/crates/yamabiko-whisper) (whisper.cpp + Silero VAD) running locally on-device with Metal acceleration.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)
- [CMake](https://cmake.org/) (required by whisper-rs-sys): `brew install cmake`
- macOS with Apple Silicon (M1+) recommended

## Model Setup (one-time)

The app needs two GGML model files. Download them into the app support directory:

```bash
mkdir -p ~/Library/Application\ Support/com.pavel.tauri-app/models
cd ~/Library/Application\ Support/com.pavel.tauri-app/models

# Whisper model (small.en for dev, ~466 MB)
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin

# Silero VAD model (~885 KB) — must be from ggml-org/whisper-vad, not ggerganov/whisper.cpp
curl -L -o ggml-silero-v6.2.0.bin https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin
```

Or override paths via environment variables:

```bash
export WHISPER_MODEL_PATH=/path/to/your/ggml-small.en.bin
export VAD_MODEL_PATH=/path/to/your/ggml-silero-v6.2.0.bin
```

### Available models

| Model | Size | Speed (Metal) | English WER | Notes |
| --- | --- | --- | --- | --- |
| `ggml-small.en` | ~466 MB | ~6-12x realtime | ~3.4% | Default for dev |
| `ggml-large-v3-turbo` | ~1.5 GB | ~8-10x realtime | ~2.5% | Recommended for production |
| `ggml-base.en` | ~142 MB | ~7-16x realtime | ~5% | Low-power fallback |

## Development

```bash
pnpm install
pnpm tauri dev
```

On first launch, grant permissions when prompted by macOS:
- **Microphone** — when using the Mic input source
- **System Audio Recording** — when using Chrome / system audio (macOS 14.2+). If capture is silent, open **System Settings → Privacy & Security → System Audio Recording Only** and enable this app, then restart it.

### Rust logging

```bash
RUST_LOG=tauri_app_lib=debug pnpm tauri dev
```

### Running tests

```bash
cd src-tauri
cargo test
```

### Golden transcript evaluation

Repeatable WER check against `test-youtube-video.txt` (reference) and `test-youtube-video.mp4` (~78s clip).

| Phase | What | Command |
| --- | --- | --- |
| 1 | Manual capture — play video in Chrome, **Stop**, save transcript to `test-output/transcript.txt` | (UI) |
| 2–4 | Score hypothesis vs reference, regression vs baseline | `pnpm test:golden` |
| E2E | Headless system-audio + `ffplay` (~90s, smoke test; WER reported but not gated) | `pnpm test:golden:e2e` |

Establish or refresh the baseline after a good Phase 1 run:

```bash
pnpm test:golden:baseline
```

Artifacts:

- `test-output/baseline/report.json` — committed regression baseline (default max +2% WER drift)
- `test-output/runs/<timestamp>/` — dated eval reports (gitignored)
- `test-output/e2e-transcript.txt` — output of the E2E test (gitignored)

`stop_transcription` returns a `TranscriptExport` (`text`, `wordCount`, `source`, `exportedAt`) for programmatic export; use `export_transcript` to write a file without stopping.

## Audio input sources

The **Input** dropdown on the transcribe page selects the capture source:

| Source | Use case | Label in UI |
| --- | --- | --- |
| **Chrome / system audio** (default) | Play a YouTube video in Chrome on the default output; transcribes what you hear through the speakers/headphones | **Remote** |
| **Microphone** | Speak into the mic | **User** |

Override the default with an environment variable:

```bash
export TRANSCRIPTION_AUDIO_SOURCE=mic   # or system
```

### Repeatable YouTube test

1. Open Chrome and queue a video (e.g. your `test-readaloud.txt` read by a TTS video, or any fixed clip).
2. Select **Chrome / system audio** in the app.
3. Click **Start**, then play the video in Chrome.
4. Transcript lines appear under **Remote** as the video plays.
5. Click **Stop** when done.

## Manual Test Plan

1. `pnpm tauri dev`
2. Grant system-audio or microphone permission when prompted
3. **System audio:** play a YouTube clip in Chrome — see **Remote** lines
4. **Mic:** switch input to Microphone, click **Start**, speak — see **User** lines
5. Transcript panel scrolls to bottom as new text arrives
6. Click **Stop** — capture ends, no new segments
7. Restart app — Start again works (no leaked capture handle)

## Architecture

See [src-tauri/ARCHITECTURE.md](src-tauri/ARCHITECTURE.md) for the Rust backend module layout, conventions, and design decisions.
