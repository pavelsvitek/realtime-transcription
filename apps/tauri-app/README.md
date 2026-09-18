# Tauri Transcription App

Real-time English speech-to-text using NVIDIA Nemotron 3.5 ASR Streaming 0.6B on macOS, with optional xAI Speech-to-Text as a cloud backend.

## Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)
- full Xcode installation with command-line tools selected via `xcode-select`
- macOS with Apple Silicon (M1+) recommended

## Nemotron setup (one-time)

Build the Swift helper and download the CoreML INT8 model:

```bash
./scripts/setup-nemotron.sh
```

This builds:

- helper binary: `nemotron-helper/.build/release/nemotron-bridge`
- model cache root: `~/Library/Application Support/com.pavel.tauri-app/models/nemotron`

The integration explicitly pins:

- runtime: `speech-swift` 0.0.22
- model: `aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8`
- audio: English (`en-US` prompt), 16 kHz mono, 320 ms model chunks

Optional override for the helper binary:

```bash
export NEMOTRON_BRIDGE_PATH=/absolute/path/to/nemotron-bridge
```

## Development

From the repo root after `pnpm install`:

```bash
pnpm dev:desktop
```

Or from this package:

```bash
pnpm tauri dev
```

On first launch, grant permissions when prompted by macOS:
- **Microphone** — when using the Mic input source
- **System Audio Recording** — when using Chrome / system audio. macOS may prompt the first time you start system-audio capture. If capture is silent, open **System Settings → Privacy & Security → System Audio Recording Only** (or **Screen & System Audio Recording** on some macOS versions) and enable **tauri-app**, then quit and restart the app.

`pnpm tauri dev` launches via a dev `.app` bundle (`src-tauri/target/debug/tauri-app-dev.app`) using `open`, so macOS can attribute system-audio permission to `com.pavel.tauri-app`. Running the raw `target/debug/tauri-app` binary from a terminal will not trigger the permission prompt and loopback will be silent.

Stopping `pnpm tauri dev` (or a Cargo rebuild) quits that window. The runner kills the previous `tauri-app-dev.app` process before launching so you do not stack extra instances.

The **ASR** dropdown on New chat selects **Local (Nemotron)** or **xAI Speech-to-Text** (persisted in `localStorage`). For xAI, save an API key on **Settings** (stored under Application Support) or set `XAI_API_KEY`. Details: [docs/technical/xai-speech-to-text.md](../../docs/technical/xai-speech-to-text.md).

To reset system-audio permission during development:

```bash
# Correct TCC service name for Core Audio loopback (not SystemAudioCapture):
tccutil reset AudioCapture com.pavel.tauri-app

# Or reset all apps' audio-capture grants:
tccutil reset AudioCapture
```

If `tccutil reset AudioCapture com.pavel.tauri-app` fails, the app has not registered with TCC yet — start `pnpm tauri dev`, click **Start** with system audio, then check System Settings manually.

### Rust logging

```bash
RUST_LOG=tauri_app_lib=debug pnpm tauri dev
```

### Nemotron helper changes

The Rust backend spawns the **release** helper binary, not debug:

```text
nemotron-helper/.build/release/nemotron-bridge
```

(`AppConfig::default_helper_path()` in `src-tauri/src/config.rs`.)

`pnpm tauri dev` and `pnpm tauri build` copy that binary into Tauri's target-specific sidecar location before launching or bundling.

After editing `nemotron-helper`, rebuild release and restart the app. See [docs/instructions.md](../../docs/instructions.md).

```bash
cd nemotron-helper
swift build -c release --product nemotron-bridge
```

Or re-run setup:

```bash
./scripts/setup-nemotron.sh
```

`swift build` without `-c release` only updates `.build/debug/nemotron-bridge`:

```bash
export NEMOTRON_BRIDGE_PATH="$PWD/nemotron-helper/.build/debug/nemotron-bridge"
```

Streaming utterance boundaries are configurable for evaluation:

```bash
export NEMOTRON_SPEECH_RMS_THRESHOLD=0.01
export NEMOTRON_EOU_SILENCE_MS=800
export NEMOTRON_MIN_SPEECH_MS=300
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

Reference transcripts are fixed ground truth and must be audited manually against source audio. Never regenerate a reference from the model under test. See [golden-dataset/README.md](golden-dataset/README.md).

Establish or refresh the baseline after a good Phase 1 run:

```bash
pnpm test:golden:baseline
```

Artifacts:

- `test-output/baseline/report.json` — committed regression baseline (default max +2% WER drift)
- `test-output/runs/<timestamp>/` — dated eval reports (gitignored)
- `test-output/e2e-transcript.txt` — output of the E2E test (gitignored)

The Rust E2E test enforces `GOLDEN_E2E_MAX_WER` default `0.05` (5%).

### NOTSOFAR eval-small (local vs xAI)

Speaker-agnostic WER on far-field single-channel meetings. Default **10 meetings**. Results: [docs/eval/dataset-notsofar.md](../../docs/eval/dataset-notsofar.md).

```bash
python3 scripts/eval_notsofar.py --n-meetings 10 --backends local
```

Requires the Nemotron helper/model (`./scripts/setup-nemotron.sh`) and `ffmpeg`. Downloads go to `eval-data/notsofar/` (gitignored).

Nemotron 3.5 validation measured 4.59% file-pipeline WER and 4.95% clean system-audio E2E WER with the repository scorer, passing the 5% product gate. See [MODEL_INVESTIGATION.md](../../MODEL_INVESTIGATION.md).

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

## Real-time behavior

- Each active source owns an isolated helper process and model instance because `speech-swift` documents the model as non-thread-safe.
- The helper resamples capture audio to 16 kHz and feeds arbitrary packets into the model’s fixed 320 ms streaming buffer.
- Model outputs are cumulative hypotheses. The UI replaces the stream-scoped partial rather than appending each update.
- Rolling energy detection finalizes an utterance after trailing silence, emits a commit, and starts a fresh model session.
- The SDK exposes no timestamps. Segment bounds come from the helper’s monotonic audio sample clock.

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
