# Model Investigation

## Current model

The app uses
[`nvidia/nemotron-labs-unified-asr-0.6b`](https://huggingface.co/nvidia/nemotron-labs-unified-asr-0.6b)
through a community CoreML INT8 conversion:

- artifact: `FluidInference/nemotron-labs-unified-asr-0.6b-coreml` (`coreml/` subfolder)
- runtime: `FluidAudio` 0.18.4, `StreamingUnifiedAsrManager`
- architecture: prompt-conditioned Unified FastConformer encoder (24 layers) with an RNN-T decoder (25 European languages + `auto`)
- parameters: approximately 600 million
- input: 16 kHz mono Float32 with the app defaulting to `auto` (`prompt_id = 127`, configurable in **Settings → Language detection** or via `NEMOTRON_UNIFIED_LANGUAGE`)
- compiled streaming geometry: default `70_7_7` (1,120 ms latency = 560 ms chunk + 560 ms lookahead, 5.6 s left context; overridable via `NEMOTRON_UNIFIED_LATENCY_MS=560|1120|2080` and `NEMOTRON_UNIFIED_PRECISION=int8|fp16`)
- artifact size: approximately 602 MB (577 MB INT8 streaming encoder + 18 MB decoder + 7 MB joint + 68 KB vocab)

The integration pins the artifact and loads it from the app-controlled cache (`~/Library/Application Support/com.pavel.amie/models/nemotron/nemotron-labs-unified-asr/coreml`) rather than relying on the runtime’s default directory.

## Why it fits this app

Nemotron Labs Unified ASR is trained jointly for offline and chunked streaming with mode-consistency regularization (initialized from `parakeet-tdt-0.6b-v3`). Each streaming step encodes a stateless `[left | chunk | right]` window on the Apple Neural Engine (~99.6% ANE ops, ~11–12 ms per encoder call) while carrying RNN-T decoder LSTM state forward across chunks.

`nemotron-bridge` uses cursor-based utterance slicing on trailing silence (`UtteranceCursor`) so per-utterance commits are emitted without resetting the 5.6 s left-context window or RNN-T state; only speaker-change `boundary` events flush and reset the session.

The app captures mic and system audio independently, with one isolated helper process and model instance per stream. Static stream labels continue to provide `User` versus `Remote` attribution; Nemotron Unified ASR does not provide speaker diarization.

## Model-selection accuracy

The previous English-only 160 ms artifact failed this repository’s fixed-reference quality gate. A controlled comparison changed only the loaded bundle while keeping the helper, audio, IPC, and scorer fixed:

- English 160 ms: 19.79% repository WER / 17.39% NVIDIA-normalized WER
- Nemotron 3.5 320 ms: 3.89% repository WER / 3.01% NVIDIA-normalized WER

The comparison changes both checkpoint generation and compiled chunk geometry, so it does not isolate how much improvement comes from each. It does establish that the capture protocol, CoreML runtime, and reference transcript are capable of passing the 5% gate with Nemotron 3.5.

Published benchmark results are not directly comparable to this repository’s golden dataset. The app keeps a fixed, manually reviewed reference and retains its 5% E2E WER gate.

## Runtime limitations

- Model outputs are append-only cumulative transcripts (`StreamingUnifiedAsrManager.getPartialTranscript()`). `nemotron-bridge` slices per-utterance partials and commits using `UtteranceCursor`.
- There is no end-of-utterance token. The helper uses rolling energy detection (waiting at least `max(NEMOTRON_EOU_SILENCE_MS, latencyMs)` of trailing silence so speech clears the right-context holdback) to slice a commit while keeping the 5.6 s acoustic left context warm; speaker-change `boundary` calls `finish()` and `reset()`.
- `FluidAudio`'s `StreamingUnifiedAsrManager` exposes emission-aligned per-token/word timings (`consumeWordTimings()`), though `nemotron-bridge` currently drains them to keep memory bounded and derives segment times from the audio sample clock.
- Buffered streaming re-encodes the `[left | chunk | right]` window each step rather than caching encoder states; at `1120 ms` (`70_7_7`), it still runs ~2× faster than Nemotron 3.5 cache-aware 320 ms on Apple Silicon ANE.
- Helpers are terminated when their workers stop, so a new app transcription session gets fresh CoreML model processes.

## Licensing

The model is governed by the OpenMDW License Agreement, Version 1.1 (`openmdw-1.1`). Runtime code (`FluidAudio`) is Apache-2.0. Redistribution includes:

- `apps/amie/licenses/OPENMDW-1.1.txt`
- `apps/amie/licenses/NOTICE`

## Evaluation requirements

Before treating the model as production-ready, measure:

1. File and loopback E2E WER against fixed ground truth.
2. First-partial p50 and p95 latency.
3. Finalization delay after speech.
4. One-stream and two-stream resident memory.
5. Dropped or backlogged capture audio.
6. Timestamp drift.
7. Repeated start/stop behavior.
8. A 30-minute dual-stream soak with CoreML stability monitoring.

## Local validation snapshot

Nemotron 3.5 switch validation on July 17, 2026:

- Fixed-reference file pipeline: **4.59% repository WER** (7 substitutions, 3 insertions, 3 deletions over 283 words), passing the 5% gate.
- Clean system-audio loopback E2E: **4.95% repository WER** and **4.35% Python-evaluator WER**, both passing their 5% gates.
- File versus loopback delta: approximately **+0.35 percentage points** under the repository scorer.
- The previous English 160 ms file result was **18.0%**, so the production-path file WER improved by **13.4 points** (approximately 74% relative).
- The first E2E attempt was excluded because unrelated system audio was playing at startup; its transcript visibly contained an unrelated prefix. The uncontaminated rerun is the reported result.
- The prior CoreAudio construction hang did not recur; the full loopback suite completed in approximately 100 seconds.
- Swift helper tests, all 41 Rust unit tests, and all 8 frontend tests passed.

Latency, memory, repeated-lifecycle, and long-soak figures previously collected for the English 160 ms artifact must be remeasured before being attributed to Nemotron 3.5.

### Nemotron Labs Unified ASR 0.6B (`FluidAudio 0.18.4`) validation on November 23, 2026

- Full 10-meeting NOTSOFAR eval-small (64.2 min far-field audio, 15,465 reference words; see `docs/eval/dataset-notsofar.md`):
  - **Default `1120 ms INT8` (`70_7_7_int8`, cursor commits):** **39.50% macro / 39.93% micro WER** (S=823, I=100, D=5,252) in **4.65 min wall** (~2× faster than Nemotron 3.5's 8.7 min; **−15.6% substitutions**, **−27.5% insertions**).
  - **`2080 ms INT8` (`70_13_13_int8`, cursor commits):** **39.01% macro / 39.47% micro WER** (S=775, I=94, D=5,235) in **2.86 min wall** (~3× faster than Nemotron 3.5; **−20.5% substitutions**, **−31.9% insertions**, beats Nemotron 3.5 overall macro/micro WER).
- Dual-stream RSS check (two concurrent `nemotron-bridge` processes streaming 15 s of meeting audio with a speaker boundary): **126.1 MB total RSS** (63.0 MB + 63.2 MB), completed in 1.17 s wall (~13× real-time).
- `nemotron-bridge` release binary shrank from **38 MB** (`speech-swift 0.0.29` with MLX) to **21 MB** (`FluidAudio 0.18.4`), linking only Apple system frameworks/dylibs (`otool -L`).
- Fixed-reference golden file/loopback WER still needs to be measured once `golden-dataset/clips/test-youtube-video.mp4` is present locally.
