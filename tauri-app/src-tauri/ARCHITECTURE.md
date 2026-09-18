# Rust Backend Architecture

This document describes the module layout, conventions, and key decisions for the Tauri Rust backend. It is the reference for both human and AI contributors.

## Module layout

```
src/
├── main.rs                 # binary entry; calls tauri_app_lib::run()
├── lib.rs                  # mod declarations + tauri::Builder setup only
├── error.rs                # AppError enum (thiserror)
├── config.rs               # AppConfig: model paths, env overrides, defaults
├── state.rs                # TranscriptionHandle (Arc<Mutex<…>>)
│
├── commands/               # thin Tauri command adapters
│   ├── mod.rs
│   └── transcription.rs    # start_transcription, stop_transcription
│
├── ipc/                    # serde types crossing the webview boundary
│   ├── mod.rs
│   └── transcript.rs       # TranscriptPartial, TranscriptCommit, TranscriptionStatus
│
├── transcription/          # domain: mic → ASR → events
│   ├── mod.rs              # pub use + TranscriptionService facade
│   ├── service.rs          # start/stop lifecycle, worker spawn/join
│   ├── worker.rs           # loop: read audio → pipeline → emit events
│   ├── mic_input.rs        # cpal mic stream setup
│   ├── asr.rs              # Nemotron engine wrapper
│   ├── nemotron.rs         # Swift helper protocol and process adapter
│   └── labels.rs           # speaker constants (USER, MIC_STREAM)
```

### Directory purposes

| Directory | Purpose |
| --- | --- |
| `commands/` | Tauri `#[command]` handlers. Parse args, call a service, map errors to `String`. No business logic. |
| `ipc/` | Serde structs for events and command payloads. The single source of truth for the Rust ↔ webview boundary. |
| `transcription/` | Domain logic: audio capture, ASR pipeline, event emission. Self-contained — could be extracted to its own crate. |

## Import rules

| Layer | May import | Must not import |
| --- | --- | --- |
| `commands/` | `state`, `ipc`, `transcription` | `cpal`, helper-process internals directly |
| `transcription/` | `ipc`, `config`, `error` | `tauri::AppHandle` in deep internals |
| `ipc/` | `serde` only | any domain or OS crates |
| `lib.rs` | everything | (keep it short — wiring only) |

The `transcription/` modules receive an emitter callback (`Fn(TranscriptEvent)`) rather than importing `AppHandle` directly. This keeps the domain testable without a Tauri runtime.

## Error handling

Two crates, two roles:

- **`thiserror`** — defines `AppError` in `error.rs` with typed variants (`Capture`, `Asr`, `AlreadyRunning`, `Io`). Used at the command boundary so callers can match on specific failures.
- **`anyhow`** — used inside worker loops and model loading for ergonomic context chains. Converted to `AppError` or `String` before crossing the IPC edge.

Rule: `#[tauri::command]` handlers return `Result<T, String>`. The conversion from `AppError` to `String` happens only in `commands/`.

## Logging

Structured logging via `tracing` + `tracing-subscriber` with `EnvFilter`.

### Levels

| Level | When to use |
| --- | --- |
| `error!` | Unrecoverable: model load failed, cpal device error, permission denied |
| `warn!` | Recoverable: channel backpressure (dropped frames), empty ASR output |
| `info!` | Lifecycle milestones: model loaded (with duration), transcription started/stopped |
| `debug!` | Per-chunk: audio chunk size, ASR latency per window, partial/commit counts |
| `trace!` | Hot-path: sample counts, VAD state transitions (off by default) |

### Instrumentation points

- `transcription/service.rs` — state transitions, model load duration
- `transcription/worker.rs` — chunk recv rate, ASR processing time
- `transcription/mic_input.rs` — device name, sample rate, open/close
- `transcription/asr.rs` — model path, load time, pipeline config
- `commands/transcription.rs` — command invoked, result

Filter at runtime with `RUST_LOG=tauri_app_lib=debug`.

## Threading model

Three execution contexts:

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Main thread │     │  cpal callback   │     │  Worker thread   │
│  (Tauri)     │     │  (audio thread)  │     │  (spawn_blocking)│
│              │     │                  │     │                  │
│  commands/   │     │  mic_input.rs    │     │  worker.rs       │
│  lib.rs      │     │  writes f32 →    │     │  reads ← channel │
│  state.rs    │     │  bounded channel │     │  feeds ASR       │
│              │     │                  │     │  emits events    │
└─────────────┘     └──────────────────┘     └─────────────────┘
```

- **Main thread** runs Tauri commands and event emission. Must never block on inference.
- **cpal callback** fires on the OS audio thread. Writes `f32` samples into a bounded `mpsc` channel. Must be non-blocking — if the channel is full, log a warning and drop the frame.
- **Worker thread** owns a Nemotron helper process. It reads from the channel, forwards chunks, and calls the emitter callback with partial/commit events.

Cooperative stop: `Arc<AtomicBool>` shared between the service and worker. The worker checks it on each loop iteration.

## Audio level monitoring

The cpal callback computes a running RMS level from each chunk of `f32` samples before sending them to the worker channel. This value is emitted as a `transcription.mic_level` event so the UI can show a live mic activity indicator without polling.

```
cpal callback:
  1. compute RMS = sqrt(sum(s²) / n)
  2. send chunk to worker channel (existing)
  3. store RMS in Arc<AtomicU32> (f32 bits)

Main thread (throttled, ~10 Hz):
  read AtomicU32 → emit transcription.mic_level { rms: f32 }
```

The RMS value is a `f32` in the range `[0.0, 1.0]`. The UI maps this to a mic status indicator: green when `rms > threshold`, default/muted when silent. Error states (device lost, permission denied) are signaled via `transcription.status { error }`, not the level event.

## Shutdown ordering

When `stop_transcription` is called:

1. Drop (or pause) the `cpal::Stream` — stops audio callbacks immediately.
2. Close the sender side of the `mpsc` channel — the worker sees `None` on next recv.
3. Worker drains remaining buffered chunks, flushes a final `transcript.commit` if any partial text is pending.
4. Worker exits; `JoinHandle` resolves.
5. Emit `transcription.status { active: false }`.

This ordering prevents the worker from hanging on a channel recv that never closes and ensures no audio is silently dropped mid-word.

## Sleep/wake handling

When macOS sleeps during an active transcription session, the audio device becomes unavailable. Rather than attempting to reconnect, the app performs a clean stop:

1. Register for `NSWorkspaceWillSleepNotification` (via `objc2` or Tauri's `RunEvent::ExitRequested` — whichever fires first).
2. On sleep: call the same shutdown sequence as `stop_transcription` (drop stream → drain worker → flush final commit → emit status).
3. Emit `transcription.status { active: false, error: "Device suspended (system sleep)" }` so the UI shows that transcription ended due to sleep, not a crash.
4. On wake: no automatic restart. The user clicks Start again. Models remain in memory — only the cpal stream and worker need to re-initialize.

This avoids dangling threads, stuck channel recvs, and silent audio loss if the Mac sleeps mid-sentence.

## Model loading

MVP strategy: **load on first use**.

- Models are loaded on the first call to `start_transcription`, not on app startup.
- Emit `transcription.status { loading: true }` so the UI can show a loading state.
- Once loaded, models stay in memory for the process lifetime (no per-session reload).
- If loading fails, emit `transcription.status { error: "..." }` and abort.

Model paths resolve via env vars (`WHISPER_MODEL_PATH`, `VAD_MODEL_PATH`) with a default of `~/Library/Application Support/com.pavel.tauri-app/models/`.

## Testing

Test our integration logic and custom behavior, not library internals.

### What to test

| Module | What to test |
| --- | --- |
| `config.rs` | Env var override precedence, default path resolution, missing file errors |
| `ipc/transcript.rs` | Serde round-trip — field names match what React expects |
| `transcription/service.rs` | Lifecycle state machine (idle → active → idle), double-start guard, stop-when-idle no-op |
| `transcription/worker.rs` | Event ordering (partial then commit), clean exit on channel close |
| `transcription/mic_input.rs` | Config → `StreamConfig` mapping only (hardware tested manually) |
| `error.rs` | `Display` formatting is user-readable |

### Testability pattern

The worker loop accepts a generic emitter:

```rust
pub fn run_worker<E>(
    audio_rx: Receiver<Vec<f32>>,
    pipeline: &mut AsrPipeline,
    emit: E,
    stop: Arc<AtomicBool>,
) where
    E: Fn(TranscriptEvent),
```

In production, `emit` calls `app_handle.emit(...)`. In tests, it pushes into a `Vec` for assertion. No Tauri runtime needed.

### What not to test

- CoreML model accuracy in unit tests (covered by golden evaluation)
- `cpal` device enumeration (OS-level, manual)
- Serde derive correctness (trust the macro)
- Tauri command routing (trust `generate_handler!`)

### Running tests

```bash
cargo test -p tauri-app                              # all tests
cargo test -p tauri-app transcription::              # transcription module only
RUST_LOG=debug cargo test -p tauri-app -- --nocapture # with log output
```

## Future improvements

### Remote stream via ScreenCaptureKit (phase 3)

When ScreenCaptureKit capture is ready:

1. Add `capture/` directory with `mod.rs` and `sck.rs`.
2. The SCK module produces `f32` chunks into its own channel, consumed by a second worker instance.
3. Both workers emit events with `stream: "mic"` or `stream: "remote"` — the UI already keys on this field.
4. Add `merge/` module if timeline interleaving is needed before events reach the frontend.
5. Diarization (`diarization/` with `polyvoice`) attaches speaker labels to the remote stream in phase 4.

No changes to `commands/`, `ipc/`, or the React event listener shape are needed — the `speaker` and `stream` fields are already present in all payloads.

**Alternative: Swift sidecar for audio capture.** Jamie (a Tauri 2 competitor app) uses a dedicated Swift sidecar binary for audio recording rather than doing capture in Rust. Core Audio and AVFoundation APIs are more ergonomic in Swift, and ScreenCaptureKit's Swift API is first-class while the Rust bindings (`screencapturekit-rs`) are thin. If `cpal` or `screencapturekit-rs` proves problematic for system audio, consider a Swift sidecar that captures both mic and system audio and writes PCM chunks to stdout/pipe, consumed by the Rust worker. This keeps the ASR pipeline in Rust while delegating OS audio APIs to Swift where they are best supported.

### Microphone hot-swap

Currently `mic_input.rs` opens the default input device once at start. If the user connects a new device (e.g. AirPods) mid-session, the existing cpal stream continues on the old device. A future improvement should:

- Listen for `cpal::Host` device-change notifications (or poll periodically).
- When the default device changes, tear down the current stream and open a new one on the new device.
- Emit `transcription.status` with the new device name so the UI can confirm the switch.
- Ensure no audio gap — drain the old channel, swap the sender, and resume.

### Quit guard

When transcription is active, closing the window should not silently kill the session. A future improvement should use Tauri's `on_window_event` / `CloseRequested` to intercept the close, show a confirmation dialog ("Transcription is active. Stop and quit?"), and perform a clean shutdown before exiting. This prevents dangling mic handles and lost audio.

### NSPanel overlay window

For the copilot overlay (live suggestion cards visible during a call), the window should be an `NSPanel` (floating, non-activating) rather than a standard `NSWindow`. This lets the overlay hover above other apps without stealing keyboard focus. Jamie uses this pattern for its recording UI. Requires `objc2` interop to set `NSPanel` properties (`isFloatingPanel`, `becomesKeyOnlyIfNeeded`).
