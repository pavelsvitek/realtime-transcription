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

# Silero VAD model
curl -L -O https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-silero-vad.bin
```

Or override paths via environment variables:

```bash
export WHISPER_MODEL_PATH=/path/to/your/ggml-small.en.bin
export VAD_MODEL_PATH=/path/to/your/ggml-silero-vad.bin
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

On first launch, grant microphone permission when prompted by macOS.

### Rust logging

```bash
RUST_LOG=tauri_app_lib=debug pnpm tauri dev
```

### Running tests

```bash
cd src-tauri
cargo test
```

## Manual Test Plan

1. `pnpm tauri dev`
2. Grant microphone permission when prompted
3. Click **Start** -- speak -- see partial (gray) then committed (solid) lines labeled **User**
4. Transcript panel scrolls to bottom as new text arrives
5. Mic indicator turns green when audio is detected
6. Click **Stop** -- capture ends, no new segments
7. Restart app -- Start again works (no leaked mic handle)

## Architecture

See [src-tauri/ARCHITECTURE.md](src-tauri/ARCHITECTURE.md) for the Rust backend module layout, conventions, and design decisions.
