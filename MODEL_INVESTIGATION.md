# Model Investigation

The repo originally investigated Canary as a possible Apple-local ASR path. It now uses WhisperKit instead.

## Current Implementation

- Runtime: WhisperKit via a bundled Swift helper process
- Fixed model: `large-v3-v20240930_626MB`
- Helper cache root: `~/Library/Application Support/com.pavel.tauri-app/models/whisperkit`
- Verification snapshot from June 17, 2026:
  - file-pipeline diagnostic WER: `2.8%`
  - headless system-audio E2E WER: `2.8%` via `pnpm test:golden:e2e`

### Realtime Chunking Notes

From the public sources reviewed for this repo:

- WhisperKit documents realtime microphone streaming and streaming output, but does not publish one canonical fixed realtime chunk length in the repo/docs reviewed.
- OpenAI Whisper-style long-form decoding still revolves around roughly `30s` windows.
- NVIDIA's public Canary demo uses `40s` offline-style chunks.

This repo's actual integration therefore defines its own operational policy:

- audio is forwarded continuously from Rust capture callbacks to the WhisperKit helper
- the helper refreshes the live partial transcript after `10s` of new audio
- the final committed transcript is generated on `finish`

## Historical Canary Research

These notes are preserved because they motivated the switch away from Canary for this repo.

## Historical Model Investigated

- Community CoreML conversion: [`phequals/canary-qwen-2.5b-coreml-int8`](https://huggingface.co/phequals/canary-qwen-2.5b-coreml-int8)
- Base model: [`nvidia/canary-qwen-2.5b`](https://huggingface.co/nvidia/canary-qwen-2.5b)

## What Public Usage Evidence Exists

I do **not** see strong public evidence that people are using the exact community CoreML conversion for true low-latency live transcription on Apple devices.

What does exist publicly is a smaller set of signals around the base NVIDIA model:

- On July 23, 2025, a user asked NVIDIA whether `canary-qwen-2.5b` supports chunked inference. On July 25, 2025, an NVIDIA maintainer replied yes and pointed to their Hugging Face Space demo code: [discussion #6](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/6).
- NVIDIA's Hugging Face Space accepts microphone input, but its implementation is still chunked offline-style transcription rather than rolling live ASR. The app resamples to 16 kHz, splits audio into 40-second windows, batches them, and runs `model.generate(...)`: [space app code](https://huggingface.co/spaces/nvidia/canary-qwen-2.5b/blob/main/app.py).
- On September 11, 2025, a user asked about running the model locally for YouTube video transcription on consumer hardware. NVIDIA replied on September 18, 2025 with a working NeMo recipe and said the model should run there. Another user later said they were running it on a GTX 3090: [discussion #11](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/11).
- On November 1, 2025, another user said they had it running on Jetson AGX Orin GPU and shared a basic setup/code snippet: [discussion #15](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/15).
- On July 23, 2025, a user asked for word timestamps and NVIDIA answered "No" on July 25, 2025: [discussion #4](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/4).
- On November 17, 2025, someone explicitly asked whether streaming ASR is possible. In the retrieved public page snapshot, there was no visible answer yet: [discussion #16](https://huggingface.co/nvidia/canary-qwen-2.5b/discussions/16).

## Why This Matters

Two things make the lack of public real-time examples unsurprising:

- The community CoreML conversion presents itself as model artifacts, not a full runtime. Long-audio chunking, prompt formatting, and transcript stitching are left to downstream implementations: [CoreML model card](https://huggingface.co/phequals/canary-qwen-2.5b-coreml-int8).
- NVIDIA's base model documentation describes evaluation with non-overlapping 40-second chunks and positions the model around NVIDIA GPU-accelerated systems, not Apple/CoreML-first deployment: [base model card](https://huggingface.co/nvidia/canary-qwen-2.5b).

## Current Take

Public evidence supports:

- local transcription with the base model
- chunked inference
- GPU-backed use on desktop and Jetson hardware

Public evidence does **not** yet strongly support:

- true streaming ASR
- polished low-latency realtime use
- widespread Apple/CoreML deployment of the community INT8 conversion

That likely makes this repo one of the more concrete public attempts to turn the CoreML conversion into an actual real-time transcription pipeline.

## Alternative Models For Mac Real-Time Streaming

I also did a separate search for other English ASR models that might fit this project's needs better than Canary.

### Acceptance Criteria

For a model to qualify, it should satisfy all of the following:

1. Run on MacBook hardware with public macOS or Apple Silicon support.
2. Support real-time streaming with public examples of microphone streaming or partial-result streaming.
3. Stay under 2 GB in RAM at runtime, or have a strong published proxy such as a clearly sub-2 GB model artifact or parameter count.
4. Deliver English WER around 5%, interpreted roughly as the 4% to 7% band unless otherwise noted.

If "around 5%" is interpreted strictly as 5% or lower, the candidate pool gets much smaller.

### Best Fits

#### WhisperKit

WhisperKit is the strongest public fit I found.

- The project is explicitly Apple-Silicon-focused and supports macOS and iOS through a Swift SDK and CLI: [repo](https://github.com/argmaxinc/argmax-oss-swift).
- The repo includes a microphone streaming CLI example:
  - `swift run argmax-cli transcribe --model-path ... --stream`
- The local server supports streaming transcription output as results are generated: [repo server docs](https://github.com/argmaxinc/argmax-oss-swift).
- The repo recommends a compressed `large-v3` model artifact of about `626MB` for maximum accuracy on Apple platforms: [model selection section](https://github.com/argmaxinc/argmax-oss-swift).
- The WhisperKit paper reports `0.46s` latency and `2.2% WER` for its on-device real-time ASR system: [paper](https://arxiv.org/abs/2507.10860).

Verdict: **passes all criteria cleanly**.

#### Moonshine Medium Streaming

Moonshine is the strongest non-Whisper candidate I found.

- The project is designed around live voice interfaces and explicitly supports macOS, including a Mac microphone transcription example app: [repo](https://github.com/moonshine-ai/moonshine).
- The Python quickstart includes a microphone transcriber that prints transcript updates live:
  - `python -m moonshine_voice.mic_transcriber --language en`
- The project describes itself as optimized for live streaming and low-latency responses while the user is still talking: [repo](https://github.com/moonshine-ai/moonshine).
- Their published comparison table reports:
  - `Moonshine Medium Streaming`: `6.65% WER`
  - `245 million` parameters
  - `107ms` on MacBook Pro
- Source: [Moonshine README comparison table](https://github.com/moonshine-ai/moonshine).

The repo does not publish a direct resident RAM number for the medium model, but `245M` parameters strongly suggests it should fit comfortably under the 2 GB cap. That is an inference from parameter count, not a directly published runtime memory measurement.

Verdict: **passes if 6-7% counts as "around 5%"**.

### Near Misses

#### Vosk

Vosk has strong streaming support and a macOS-friendly toolkit story, but it does not cleanly pass the size requirement for its most accurate English model.

- Vosk provides a streaming API and offline recognition toolkit: [overview](https://alphacephei.com/vosk/), [repo](https://github.com/alphacep/vosk-api).
- The English `vosk-model-en-us-0.22` reports `5.69` WER on LibriSpeech test-clean: [model list](https://alphacephei.com/vosk/models).
- However, Vosk's model page says big models can require up to `16GB` of memory at runtime, which fails the memory bar even though the model file itself is `1.8G`: [model list](https://alphacephei.com/vosk/models).

Verdict: **fails the runtime memory criterion**.

#### whisper.cpp With Standard Whisper Models

`whisper.cpp` is an excellent runtime, but the standard published Whisper size/accuracy tradeoffs do not cleanly satisfy all of the criteria at once.

- `whisper.cpp` has first-class Apple Silicon support, Metal acceleration, and a real-time microphone example called `whisper-stream`: [repo](https://github.com/ggml-org/whisper.cpp).
- It publishes memory estimates for several model sizes:
  - `small`: about `852 MB`
  - `medium`: about `2.1 GB`
  - `large`: about `3.9 GB`
- Source: [memory usage table](https://github.com/ggml-org/whisper.cpp).
- This means `small` fits the memory cap but typically does not reach the target WER band, while the more accurate larger models exceed the published memory limit unless a separate compressed runtime such as WhisperKit is used.

Verdict: **runtime passes, but standard model tradeoffs do not cleanly pass the full filter**.

#### NVIDIA Nemotron Speech Streaming

This is a promising recent result, but it misses the accuracy target.

- An April 16, 2026 paper identifies NVIDIA Nemotron Speech Streaming as a strong on-device streaming candidate and reports quantization from `2.47 GB` down to `0.67 GB`: [paper](https://arxiv.org/abs/2604.14493).
- The same paper reports `8.20%` average streaming WER across eight benchmarks with `0.56s` algorithmic latency.

Verdict: **passes size and streaming, misses the WER target**.

### Shortlist Summary

If "around 5%" means `<= 5%`, the strongest public fit I found is:

- WhisperKit

If "around 5%" means roughly `5% to 7%`, the shortlist becomes:

- WhisperKit
- Moonshine Medium Streaming
