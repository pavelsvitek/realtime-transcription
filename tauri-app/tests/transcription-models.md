# Transcription model benchmarks

Golden eval results for `test-youtube-video.mp4` (~78s) against `test-youtube-video.txt` (299 reference words).

Evaluated on **2026-06-12** on Apple M1 Pro with Metal. Pipeline: yamabiko-whisper (Whisper + Silero VAD + LocalAgreement-2).

## Test paths

| Path | What it measures |
| --- | --- |
| **File pipeline** | Full video decoded via ffmpeg → ASR pipeline, no loopback, no dropped frames. Best-case quality for a given model. |
| **Phase 1 UI** | Manual capture: play video in Chrome, system-audio loopback, stop, save `test-output/transcript.txt`. |
| **E2E headless** | `ffplay` + system-audio loopback in `cargo test golden_system_audio_e2e`. |

Reproduce file-pipeline numbers:

```bash
cd src-tauri
cargo test diagnose_model_vs_commit_strategy -- --ignored --nocapture
```

Override model:

```bash
export WHISPER_MODEL_PATH=~/Library/Application\ Support/com.pavel.tauri-app/models/ggml-small.en.bin
# or ggml-large-v3-turbo.bin
```

## File pipeline (no audio drops)

Same streaming pipeline as production; only the capture path differs.

| Model | Transcript | WER | Words | S | I | D | Runtime |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `ggml-small.en` | committed-only | **21.9%** | 228 | 5 | 1 | 56 | ~84s |
| `ggml-small.en` | committed + `finish()` | **21.9%** | 228 | 5 | 1 | 56 | — |
| `ggml-large-v3-turbo` | committed-only | **9.2%** | 266 | 5 | 2 | 19 | ~135s |
| `ggml-large-v3-turbo` | committed + `finish()` | **6.4%** | 274 | 5 | 2 | 11 | — |

Large-model file run repeated twice; WER was stable (9.2% / 6.4% both times).

Outputs: `test-output/diagnostic/file-committed-only.txt`, `file-with-finish.txt`.

### Model comparison (file pipeline)

| Model | WER (committed) | Δ vs small.en |
| --- | ---: | ---: |
| `ggml-small.en` | 21.9% | — |
| `ggml-large-v3-turbo` | 9.2% | **−12.7 pp** |

Large model recovers ~38 more words vs reference (266 vs 228) and cuts deletions sharply (19 vs 56).

## Real-time capture (small.en only)

Recorded before switching default model.

| Path | WER | Words | S | I | D | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Phase 1 UI | **27.8%** | 233 | 15 | 1 | 67 | Baseline in `test-output/baseline/report.json` |
| Phase 1 UI (diagnostic re-score) | 29.3% | 217 | 15 | 1 | 67 | Same transcript, minor word-count variance |
| E2E headless (run 1) | 65.5% | 110 | 7 | 1 | 179 | Heavy audio loss |
| E2E headless (run 2) | 42.1% | 197 | 22 | 1 | 103 | No logged frame drops |

### UI / E2E vs file baseline (small.en)

| Comparison | WER delta |
| --- | ---: |
| Phase 1 UI vs file committed-only | +7.4 pp |
| E2E (best run) vs file committed-only | +20.2 pp |

Real-time loopback adds 7–20+ percentage points on top of the model floor.

## Commit strategy (LocalAgreement-2)

| Model | committed-only | committed + `finish()` | Gap |
| --- | ---: | ---: | ---: |
| `ggml-small.en` | 21.9% | 21.9% | 0.0 pp |
| `ggml-large-v3-turbo` | 9.2% | 6.4% | **−2.8 pp** |

On small.en, `finish()` adds nothing — tentative tail is already committed. On large-v3-turbo, the final flush recovers a small amount of trailing text. Commit strategy is not the main quality bottleneck; model size and real-time capture are.

## Takeaways

1. **Model dominates** — large-v3-turbo on full audio is ~9% WER vs ~22% for small.en.
2. **Real-time capture adds overhead** — UI ~28% on small.en; expect improvement after re-recording Phase 1 with large model + app restart.
3. **E2E is variable** — headless loopback WER ranged 42–66% on small.en; not used as regression baseline.
4. **Default model** — app prefers `ggml-large-v3-turbo.bin` when present in `~/Library/Application Support/com.pavel.tauri-app/models/`, else `ggml-small.en.bin`.

## Not yet measured

- Phase 1 UI with `ggml-large-v3-turbo` (restart app, re-record `test-output/transcript.txt`, run `pnpm test:golden`).
- E2E headless with large model.
