# Model Investigation

## Current model

The app uses
[`nvidia/nemotron-3.5-asr-streaming-0.6b`](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b)
through a community CoreML INT8 conversion:

- artifact: `aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8`
- runtime: `speech-swift` 0.0.22, `NemotronStreamingASR`
- architecture: prompt-conditioned cache-aware FastConformer encoder with an RNN-T decoder
- parameters: approximately 600 million
- input: 16 kHz mono Float32 with the app explicitly selecting `en-US`
- compiled streaming geometry: 320 ms with 240 ms lookahead
- artifact size: approximately 612 MB

The integration pins the artifact and loads it from the app-controlled cache rather than relying on the runtime’s changing default model.

## Why it fits this app

Nemotron is trained for stateful streaming. Each incoming audio frame is processed once and encoder/RNN-T state is carried forward, instead of repeatedly decoding an overlapping long window. This gives the UI sub-second cumulative hypotheses and keeps compute bounded during long calls.

The app captures mic and system audio independently. Each stream runs an isolated helper process and model instance because `speech-swift` documents the model class as non-thread-safe. Static stream labels continue to provide `User` versus `Remote` attribution; Nemotron does not provide speaker diarization.

## Model-selection accuracy

The previous English-only 160 ms artifact failed this repository’s fixed-reference quality gate. A controlled comparison changed only the loaded bundle while keeping the helper, audio, IPC, and scorer fixed:

- English 160 ms: 19.79% repository WER / 17.39% NVIDIA-normalized WER
- Nemotron 3.5 320 ms: 3.89% repository WER / 3.01% NVIDIA-normalized WER

The comparison changes both checkpoint generation and compiled chunk geometry, so it does not isolate how much improvement comes from each. It does establish that the capture protocol, CoreML runtime, and reference transcript are capable of passing the 5% gate with Nemotron 3.5.

Published benchmark results are not directly comparable to this repository’s golden dataset. The app keeps a fixed, manually reviewed reference and retains its 5% E2E WER gate.

## Runtime limitations

- Model outputs are cumulative hypotheses, not text deltas.
- There is no end-of-utterance token. The helper uses rolling energy detection, calls `finalize()` at a speech boundary, emits a commit, and creates a fresh model session.
- The runtime exposes no token or word timestamps. Segment times are derived from the audio sample clock.
- `confidence` is based on mean token log probability and is not calibrated.
- `segmentIndex` is not useful in the current runtime.
- Long-running CoreML workloads may exhaust IOSurface resources. Inference runs inside autorelease pools and the app recreates helper processes between transcription sessions.

## Licensing

The model is governed by the NVIDIA Open Model License. Redistribution includes:

- `apps/tauri-app/licenses/NVIDIA-OPEN-MODEL-LICENSE.txt`
- `apps/tauri-app/licenses/NOTICE`

The runtime code is Apache-2.0.

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
