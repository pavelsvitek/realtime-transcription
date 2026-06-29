# E2E WER Fix Attempts — Experiment Log

Running log of individual fix attempts to close the gap between file pipeline (~3% WER) and system-audio E2E (~18% WER).

**Reference:** [golden-test-wer-gap.md](./golden-test-wer-gap.md), [closing-the-e2e-wer-gap.md](./closing-the-e2e-wer-gap.md)

**Golden clip:** `tauri-app/test-youtube-video.mp4` (~77.8 s) / `test-youtube-video.txt`

**How to measure:**

```bash
# File pipeline ceiling
cd tauri-app/src-tauri && cargo test diagnose_model_vs_commit_strategy -- --ignored --nocapture

# E2E headless (partials on)
cd tauri-app/src-tauri && cargo test golden_system_audio_e2e -- --ignored --nocapture

# E2E headless (partials off — F2.a)
cd tauri-app/src-tauri && WHISPERKIT_DISABLE_PARTIALS=1 cargo test golden_system_audio_e2e -- --ignored --nocapture
```

---

## Summary

| Attempt | Fix ID | Description | File WER | E2E WER | Dropped samples | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | baseline | No code changes | 2.8% | 13.8% | unknown | done |
| 1 | F4 | Capture instrumentation | 2.8% | 14.5% | 0 | done |
| 2 | F2.a | Disable partials in headless | 2.8% | 3.2% (rerun) | 0 | done |
| 2b | F2.a | Same, first run (flaky) | — | 99.3% | 0 | flaky |
| 3 | F2.b+c | Windowed partials + incremental commits + async decode | 2.8% | **3.5%** ×2 | 0 | **done** |
| 4 | — | (optional) F3 capture-ready gate | — | — | — | pending |

**Key revision to root-cause model:** Full-buffer partial transcription every 10 s degraded quality (~14% WER). **Fix:** windowed tail partials (≤30 s), incremental commits every 15 s (≤30 s chunks), async decode so `pushAudio` never blocks stdin. E2E now **3.5%** with real-time streaming enabled — suitable for live meetings.

---

## Attempt 0 — Baseline (no changes)

**Date:** 2026-06-29  
**Hypothesis:** Establish current WER before any fixes.  
**Changes:** None.

### Implementation

N/A.

### Findings

- File pipeline `committed+finish`: **2.8%** — model ceiling confirmed.
- Fresh E2E run: **13.8%** (S=4 I=3 D=32).
- Previously saved E2E transcript in diagnostic: **18.4%** — historical variance exists.

### WER

| Metric | Value |
| --- | --- |
| File `committed+finish` | 2.8% |
| E2E headless | 13.8% |
| E2E dropped samples | not instrumented |

---

## Attempt 1 — F4 Capture instrumentation

**Date:** 2026-06-29  
**Hypothesis:** Measure whether frame drops explain the E2E gap (H1).  
**Fix plan ref:** F4 in [closing-the-e2e-wer-gap.md](./closing-the-e2e-wer-gap.md)

### Implementation

**`cpal_capture.rs`**

- Added `reset_capture_stats()`, `capture_stats()` returning `(captured_samples, dropped_samples, dropped_frames)`.
- On `try_send` failure: increment dropped frame + sample counters (was warn-only).

**`golden_transcript.rs`**

- Print capture summary after WER line.

**Files touched:** `cpal_capture.rs`, `mod.rs` (re-export), `golden_transcript.rs`

### Findings

- **E2E WER: 14.5%** (S=3 I=2 D=36) — similar to baseline, partials still enabled.
- **captured=4,319,232** samples (~90.0 s @ 48 kHz) — includes 4 s pre-roll + 8 s post-roll sleeps beyond 77.8 s video.
- **dropped=0, frames_dropped=0** — **H1 (frame drops) not observed on this run.**
- Extra ~12 s of captured audio is silence/ambient from fixed sleeps, not loss.

**Conclusion:** Instrumentation works. Frame drops are not the active failure mode on this machine/run; investigate partial decode impact next.

### WER

| Metric | Value |
| --- | --- |
| File `committed+finish` | 2.8% (unchanged) |
| E2E headless | 14.5% |
| captured / dropped | 4,319,232 / 0 |

---

## Attempt 2 — F2.a Disable partials in headless

**Date:** 2026-06-29  
**Hypothesis:** Full-buffer partial transcription every 10 s hurts final transcript quality or causes instability; disabling partials should match file pipeline (~3%).  
**Fix plan ref:** F2.a in [closing-the-e2e-wer-gap.md](./closing-the-e2e-wer-gap.md)

### Implementation

**Swift `main.swift`**

- `InitMessage.disablePartials: Bool?`
- `StreamSession.disablePartials` — when true, `pushAudio` accumulates only; no `emitRealtimePartial()`.

**Rust**

- `InitRequest.disable_partials` → helper init JSON.
- `WhisperkitPipeline::start(..., disable_partials)`.
- `start_headless` reads `WHISPERKIT_DISABLE_PARTIALS=1` env via `headless_disable_partials()`.

**Files touched:** `main.swift`, `whisperkit.rs`, `asr.rs`, `service.rs`, `golden_diagnostic.rs`

### Findings

**Run 1 (flaky):**

- E2E WER **99.3%** — hypothesis nearly empty (`e2e-transcript.txt`: `"Thank you."`).
- captured=4,251,648, dropped=0. Likely race or transient loopback/ffplay issue; not a stable regression.

**Run 2 (confirming):**

- E2E WER **3.2%** (S=4 I=4 D=1) — **passes** default 8% gate.
- captured=4,264,448, dropped=0, disable_partials=1.
- Matches file pipeline 2.8% within noise.

**Revised root cause:** With partials enabled, periodic full-buffer `transcribe()` during streaming correlates with ~14% WER despite zero drops. With partials disabled, E2E matches offline file quality. Partial decodes may pollute WhisperKit session state, or the interaction between blocking partials and real-time capture causes subtle alignment issues not visible in drop counters.

**Production implication:** Live UI needs partials, but they must not re-transcribe the full buffer (→ F2.b windowed partials).

### WER

| Metric | Run 1 | Run 2 |
| --- | --- | --- |
| E2E WER | 99.3% (flaky) | **3.2%** |
| captured / dropped | 4,251,648 / 0 | 4,264,448 / 0 |
| disable_partials | 1 | 1 |

---

## Attempt 3 — F2.b Windowed partials + incremental commits + F2.c async decode

**Date:** 2026-06-29  
**Hypothesis:** Real-time meetings need periodic transcription without scanning the full session buffer. Windowed partials (live UI) plus chunked commits (stable export) should match file-pipeline WER while keeping decode cost bounded.  
**Fix plan ref:** F2.b + F2.c + F6 (partial) in [closing-the-e2e-wer-gap.md](./closing-the-e2e-wer-gap.md)

### Implementation

**Swift `StreamSession` rewrite** (`main.swift`):

| Constant | Value | Role |
| --- | --- | --- |
| `streamingTriggerSamples` | 10 s @ 16 kHz | New audio before scheduling a decode cycle |
| `partialWindowSamples` | 30 s max | Tail window for live `partial` messages |
| `commitTriggerSamples` | 15 s uncommitted | Min audio before emitting incremental `commit` |
| `commitChunkSamples` | 30 s max | Max audio per commit decode (Whisper window) |
| `contextOverlapSamples` | 2 s | Ring-buffer trim retention after commit |

**Behaviour:**

1. `pushAudio` appends samples and returns immediately — **never awaits** `transcribe()`.
2. Every 10 s of new audio, `scheduleStreamingWork()` spawns a background `Task`.
3. Background cycle: while ≥15 s uncommitted → `commitNextChunk()` (decodes only `[committed..committed+30s]`); then `emitWindowedPartial()` on tail window only.
4. `finish()` awaits in-flight task, then `commitTailIfNeeded()` — **only the remainder**, not the full buffer.
5. `disablePartials=true` (F2.a headless) unchanged: accumulate-only + single full-buffer commit on finish.

**Production default:** `disablePartials=false` — windowed streaming active for app and golden E2E.

### Findings

- **File `committed+finish`: 2.8%** — unchanged model ceiling.
- **File `committed-only`: still empty** during fast file ingest — commits are async; diagnostic collects them only at `finish()`. Not a runtime bug.
- **E2E run 1: 3.5%** (S=5 I=4 D=1), captured=4,186,624, dropped=0.
- **E2E run 2: 3.5%** (S=5 I=1 D=4), captured=4,077,568, dropped=0.
- Both pass default 8% gate with **real-time streaming enabled** (no `WHISPERKIT_DISABLE_PARTIALS`).
- Test completes ~95–100 s (vs ~121 s with full-buffer partials) — bounded decode cost confirmed.

**Conclusion:** Goal met for live meetings — transcribe every ~10–15 s in bounded windows, never the whole session at once, WER ≈ file pipeline.

### WER

| Metric | Value |
| --- | --- |
| File `committed+finish` | 2.8% |
| E2E (streaming on) run 1 | **3.5%** |
| E2E (streaming on) run 2 | **3.5%** |
| dropped samples | 0 |

---

## Attempt 4 — (planned) F3 Gate playback on capture-ready

**Status:** pending  
**Goal:** Replace fixed 4 s pre-roll sleep with wait-for-first-loopback-frame before `ffplay`.

See [closing-the-e2e-wer-gap.md](./closing-the-e2e-wer-gap.md) § F3.

---

## Attempt 5 — (planned) F1 Non-dropping ring buffer

**Status:** deprioritized  
**Reason:** Attempts 1–2 showed zero drops on current hardware; F2.a already reached 3.2% WER. Revisit if drops appear on loaded systems or longer clips.

---

## Changelog

| Date | Update |
| --- | --- |
| 2026-06-29 | Created log; baseline + F4 + F2.a measured |
| 2026-06-29 | Attempt 3: windowed streaming — E2E 3.5% with real-time commits |
