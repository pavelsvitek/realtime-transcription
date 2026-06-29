# Tauri Transcription App

Real-time speech-to-text transcription using a bundled WhisperKit helper on macOS.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)
- full Xcode installation with command-line tools selected via `xcode-select`
- macOS with Apple Silicon (M1+) recommended

## WhisperKit Setup (one-time)

Build the Swift helper and download the WhisperKit model:

```bash
./scripts/setup-whisperkit.sh
```

This builds:

- helper binary: `whisperkit-helper/.build/release/whisperkit-bridge`
- model cache root: `~/Library/Application Support/com.pavel.tauri-app/models/whisperkit`

The fixed model for this repo is:

- `large-v3-v20240930_626MB`

Optional override for the helper binary:

```bash
export WHISPERKIT_BRIDGE_PATH=/absolute/path/to/whisperkit-bridge
```

## Development

```bash
pnpm install
pnpm tauri dev
```

On first launch, grant permissions when prompted by macOS:
- **Microphone** — when using the Mic input source
- **System Audio Recording** — when using Chrome / system audio. If capture is silent, open **System Settings → Privacy & Security → System Audio Recording Only** and enable this app, then restart it.

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

Repeatable WER check against the [golden dataset](golden-dataset/README.md). Reference transcripts live in `golden-dataset/transcripts/`; place MP4 clips in `golden-dataset/clips/` (gitignored).

| Phase | What | Command |
| --- | --- | --- |
| 1 | Manual capture — play video in Chrome, **Stop**, save transcript to `test-output/transcript.txt` | (UI) |
| 2–4 | Score hypothesis vs reference, regression vs baseline | `pnpm test:golden` |
| E2E | Headless system-audio + `ffplay` (~2 min, gated) | `pnpm test:golden:e2e` |

**Generate a reference transcript** from an MP4 (file pipeline, whole-file transcription):

```bash
./scripts/generate-golden-transcript.sh golden-dataset/clips/<clip>.mp4
```

See [golden-dataset/README.md](golden-dataset/README.md) for adding new clips and the full workflow.

Establish or refresh the baseline after a good Phase 1 run:

```bash
pnpm test:golden:baseline
```

Artifacts:

- `test-output/baseline/report.json` — committed regression baseline (default max +2% WER drift)
- `test-output/runs/<timestamp>/` — dated eval reports (gitignored)
- `test-output/e2e-transcript.txt` — output of the E2E test (gitignored)

Current verification snapshot on June 17, 2026:

- file-pipeline diagnostic WER: `2.8%`
- headless system-audio E2E WER: `2.8%` via `pnpm test:golden:e2e`

The Rust E2E test enforces `GOLDEN_E2E_MAX_WER` default `0.05` (5%).

`stop_transcription` returns a `TranscriptExport` for programmatic export; use `export_transcript` to write a file without stopping.

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

## Realtime Chunking Notes

WhisperKit's public docs and repo confirm realtime microphone streaming and streaming output, but the sources reviewed for this repo do **not** publish one canonical fixed chunk duration for realtime decoding.

Relevant public context:

- Whisper-style long-form processing still uses a roughly `30s` receptive-window model internally.
- NVIDIA's public Canary demo uses `40s` offline-style chunks.

This repo's integration behavior is therefore defined operationally:

- audio capture callbacks are forwarded continuously from Rust to the WhisperKit helper
- the helper refreshes the live partial transcript after `10s` of new audio to avoid loopback frame drops during expensive re-decodes
- the final high-accuracy committed transcript is generated on `Stop`

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
