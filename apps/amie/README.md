# Amie

Real-time English speech-to-text using NVIDIA Nemotron 3.5 ASR Streaming 0.6B on macOS, with optional xAI Transcribe 2.0 as a cloud backend.

The desktop app is **Amie** (`com.pavel.amie`). Meetings, Nemotron models, and the xAI key live in `~/Library/Application Support/com.pavel.amie/`.

If you still have data under the old folder, migrate once:

```bash
mv ~/Library/Application\ Support/com.pavel.tauri-app ~/Library/Application\ Support/com.pavel.amie
```

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
- model cache root: `~/Library/Application Support/com.pavel.amie/models/nemotron`

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

Run `pnpm setup:signing` once first (see [Permissions and code signing](#permissions-and-code-signing)); without it macOS forgets the permissions on every rebuild.

On first launch, grant permissions when prompted by macOS:
- **Accessibility** — optional, for speaker names from Zoom / Teams. Click **Allow Accessibility** in the app (banner on New chat, or Settings).
- **Microphone** — when using the Mic input source
- **System Audio Recording** — when using Chrome / system audio. macOS may prompt the first time you start system-audio capture. If capture is silent, open **System Settings → Privacy & Security → System Audio Recording Only** (or **Screen & System Audio Recording** on some macOS versions) and enable **Amie**, then quit and restart the app.

`pnpm tauri dev` launches via a dev `.app` bundle (`src-tauri/target/debug/amie-dev.app`, **Amie Dev**, bundle id `com.pavel.amie.dev`) using `open`, so macOS attributes microphone, system-audio and Accessibility permission to the app instead of the terminal. Running the raw `target/debug/amie` binary from a terminal will not trigger the permission prompt and loopback will be silent.

The onboarding dialog opens automatically whenever the speech model is not downloaded yet (every launch until it is). Force it anytime with `--show-onboarding` (or `AMIE_SHOW_ONBOARDING=1`), e.g. `pnpm tauri dev -- -- --show-onboarding`. After the model is on disk, a `localStorage` key `amie-onboarding-seen` (same prefs pattern as ASR backend / color scheme) keeps it from reappearing; clear that key to replay the permissions step.

Stopping `pnpm tauri dev` (or a Cargo rebuild) quits that window. The runner kills the previous `amie-dev.app` process before launching so you do not stack extra instances.

The **ASR** dropdown on New chat selects **Local (Nemotron)** or **xAI Transcribe 2.0** (persisted in `localStorage`). For xAI, save an API key on **Settings** (stored under Application Support) or set `XAI_API_KEY`. Details: [docs/technical/xai-speech-to-text.md](../../docs/technical/xai-speech-to-text.md).

## Local MCP

`amie_mcp` is a stdio MCP server over the meetings database. It does not open a port. stdout is the protocol.

```bash
cargo build --manifest-path apps/amie/src-tauri/Cargo.toml --bin amie_mcp
```

Claude Code:

```bash
claude mcp add amie -- /absolute/path/to/amie_mcp
```

Cursor or Codex (`~/.cursor/mcp.json` / `~/.codex/config.toml`):

```json
{
  "mcpServers": {
    "amie": {
      "command": "/absolute/path/to/amie_mcp"
    }
  }
}
```

The server reads meetings and can edit a meeting's title, context and summary and archive or unarchive it. It cannot delete meetings, edit transcripts, or change a meeting while it is being recorded. Add `--read-only` (or set `AMIE_MCP_READ_ONLY=1`) to drop the editing and archive tools. It never creates or migrates the database: launch Amie once first, and again after upgrading it.

Set `AMIE_DB_PATH` to point at a different `meetings.db`. The default is `~/Library/Application Support/com.pavel.amie/meetings.db`. Tool list: [docs/research/amie-local-mcp.md](../../docs/research/amie-local-mcp.md).

## Production build

From the repo root on macOS (Apple Silicon), with the Nemotron helper already built (`./apps/amie/scripts/setup-nemotron.sh`):

```bash
pnpm --filter amie tauri build
```

That writes:

- `apps/amie/src-tauri/target/release/bundle/macos/Amie.app`
- `apps/amie/src-tauri/target/release/bundle/dmg/Amie_0.1.0_aarch64.dmg`
- With `createUpdaterArtifacts`: `Amie.app.tar.gz` + `.sig` for the in-app updater

`pnpm tauri build` refuses to run without a signing identity (see below), signs the bundle with it, and checks the result. Drag **Amie.app** into `/Applications`.

## Check for Updates

The macOS **Amie** menu includes **Check for Updates…**. It uses `tauri-plugin-updater` against the public GitHub Releases feed:

`https://github.com/pavelsvitek/realtime-transcription/releases/latest/download/latest.json`

Until a signed Release exists, the menu still works: you get “up to date” or a clear network/404 error. `pnpm tauri dev` overlays **empty** updater endpoints so local debug builds never poll production.

### Minisign pubkey (replace before first Release)

`src-tauri/tauri.conf.json` → `plugins.updater.pubkey` currently holds a **placeholder** public key (generated only to satisfy the config format; the matching private key was **not** kept and must never be committed). Before publishing the first updater Release:

1. Generate your real keypair: `pnpm tauri signer generate -w ~/.tauri/amie.key`
2. Put the **public** key string into `plugins.updater.pubkey`
3. Store the private key as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (and keep an encrypted backup)

Losing the private key bricks updates for already-shipped clients until they manually install a build with a new pubkey.

## Permissions and code signing

macOS keeps each privacy grant (Accessibility, Microphone, System Audio) under the app's **bundle id plus its code requirement**. Two things follow:

| Build | Name | Bundle id |
| --- | --- | --- |
| `pnpm tauri dev` | Amie Dev | `com.pavel.amie.dev` |
| `pnpm tauri build` | Amie | `com.pavel.amie` |

They have separate rows in System Settings, so enabling one never disturbs the other.

An **ad-hoc** signature (`codesign -s -`, the default when nothing else is configured) has the requirement `cdhash H"…"`, which changes with every build. After a rebuild the old row still shows as allowed in System Settings, but macOS no longer matches it to the new binary, so `AXIsProcessTrusted` says no. That is what makes Amie ask again on every run. A **certificate** signature has a requirement derived from the certificate, which survives rebuilds and updates.

So both builds are signed with a certificate:

```bash
pnpm setup:signing
```

It uses the first of: `Developer ID Application`, `Apple Development` (Xcode → Settings → Accounts → Manage Certificates), or a local self-signed `Amie Local Signing` certificate that it creates (macOS asks for your password once to trust it for code signing). It finishes with a self-test: two different binaries must get the same requirement. Set `AMIE_SIGN_IDENTITY` to force a specific identity, or `APPLE_SIGNING_IDENTITY` for `pnpm tauri build` in CI.

- **Dev:** `scripts/macos-exec-runner.sh` signs `amie-dev.app` on each rebuild. With no identity it falls back to ad-hoc and warns.
- **Release:** `scripts/tauri.sh` passes the identity to Tauri and verifies the finished `Amie.app`. Without an identity it stops; `AMIE_ALLOW_ADHOC=1 pnpm tauri build` overrides that, and the grants then will not persist.

Swapping to a different certificate (for example local → Developer ID) counts as a different app: grant Accessibility once more.

**Accessibility shows Off although an Amie entry is on.** First check it is the right entry: the dev build and the release app are listed separately, as **Amie Dev** and **Amie**, and `pnpm tauri dev` needs **Amie Dev**. The banner and Settings → Speaker names name the entry this build needs. If the right entry is on and the app still says Off, the entry was recorded for an older signature (typically a pre-certificate ad-hoc build): select it in the list, remove it with **−**, quit and reopen the app so it registers itself again, then click **Allow Accessibility**. Amie never deletes the entry itself, because a running app caches its answer and cannot put a deleted entry back until it is relaunched.

To reset permissions by hand:

```bash
tccutil reset Accessibility com.pavel.amie.dev   # or com.pavel.amie for the release app
# then quit and reopen the app: it re-adds its entry to the list on launch

# Correct TCC service name for Core Audio loopback (not SystemAudioCapture):
tccutil reset AudioCapture com.pavel.amie.dev

# Or reset all apps' audio-capture grants:
tccutil reset AudioCapture
```

If `tccutil reset AudioCapture com.pavel.amie` fails, the app has not registered with TCC yet — start `pnpm tauri dev`, click **Start** with system audio, then check System Settings manually.

### Rust logging

```bash
RUST_LOG=amie_lib=debug pnpm tauri dev
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
