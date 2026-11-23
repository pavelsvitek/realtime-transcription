# NOTSOFAR eval-small

Speaker-agnostic WER on [NOTSOFAR-1](https://huggingface.co/datasets/microsoft/NOTSOFAR) eval-small far-field single-channel meetings. Same 10 meetings. Official NOTSOFAR ranking uses speaker-attributed tcpWER; these runs do not diarize, so scores are concatenated word WER ([`eval_wer.py`](../../apps/amie/scripts/eval_wer.py)).

Reproduce:

```bash
cd apps/amie
python3 scripts/eval_notsofar.py --n-meetings 10 --backends local
python3 scripts/eval_notsofar.py --n-meetings 10 --backends xai
```

## Shared setup

| Item | Value |
| --- | --- |
| Dataset | `microsoft/NOTSOFAR` `benchmark-datasets/eval_set/240629.1_eval_small_with_GT` |
| Meetings | First 10 IDs (sorted): `MTG_32000` … `MTG_32009`, `MTG_32020`, `MTG_32021` |
| Audio | One far-field single-channel WAV per meeting (`meetup_0`, except `plaza_0` on `MTG_32020`) |
| Reference | Gold `gt_transcription.json`, utterances sorted by `start_time`, markup like `<ST/>` stripped |
| Total audio | **64.2 min** |
| Metric | Word WER after lowercase + punctuation strip |

---

## Comparison

xAI batch STT is the most accurate of the three. Nemotron is the best **local** model: slightly ahead of WhisperKit and much faster on-device. xAI finished the set in ~82 s of API time because it is offline batch, not realtime-paced WebSocket.

| | WhisperKit large-v3 | Nemotron 3.5 0.6B (320 ms) | Nemotron Unified 0.6B (1120 ms) | Nemotron Unified 0.6B (2080 ms) | **xAI batch STT** |
| --- | ---: | ---: | ---: | ---: | ---: |
| Macro WER | 41.2% | 39.1% | 39.5% | 39.0% | **34.6%** |
| Micro WER | 41.8% | 39.5% | 39.9% | 39.5% | **35.2%** |
| Hypothesis words | 11,842 | 10,604 | 10,313 | 10,327 | 11,555 |
| Substitutions | 1,062 | 975 | 823 | **775** | 1,106 |
| Insertions | 886 | 138 | 100 | **94** | 211 |
| Deletions | 4,509 | 4,999 | 5,252 | 5,235 | **4,121** |
| Transcribe wall | ~22 min | ~8.7 min | ~4.6 min | ~2.9 min | **~1.4 min** |
| Meetings won (of 10) | 0 | 0 | 0 | 0 | **10** |

Δ vs Nemotron (negative = better than Nemotron):

| | WhisperKit | xAI |
| --- | ---: | ---: |
| Macro WER | +2.1 pp | **−4.5 pp** |
| Micro WER | +2.2 pp | **−4.4 pp** |

xAI recovers more of the overlapped far-field speech (fewest deletions) without WhisperKit’s insertion problem. Nemotron stays the most conservative locally (fewest insertions, most deletions). All three still sit in a far-field multi-talker band (~35–42%), not the ~3% YouTube golden-clip file-pipeline WER.

Per-meeting WER (bold = best on that clip):

| Meeting | WhisperKit | Nemotron | xAI |
| --- | ---: | ---: | ---: |
| MTG_32000 | 47.1% | 43.2% | **40.0%** |
| MTG_32003 | 40.5% | 39.4% | **31.7%** |
| MTG_32004 | 42.5% | 34.2% | **31.8%** |
| MTG_32005 | 34.9% | 33.3% | **25.7%** |
| MTG_32006 | 40.5% | 42.5% | **37.1%** |
| MTG_32007 | 43.4% | 40.3% | **39.1%** |
| MTG_32008 | 51.4% | 48.5% | **46.8%** |
| MTG_32009 | 33.3% | 36.9% | **27.7%** |
| MTG_32020 | 40.1% | 37.6% | **33.5%** |
| MTG_32021 | 38.4% | 34.9% | **32.2%** |

Largest xAI gap vs Nemotron: `MTG_32009` (−9.2 pp) and `MTG_32003` (−7.7 pp). Closest: `MTG_32007` (−1.2 pp). `MTG_32008` remains the hardest clip for every system.

---

## WhisperKit `large-v3-v20240930_626MB`

| Item | Value |
| --- | --- |
| Date | 2026-09-11 |
| Branch | `experiment/xai-speed-to-text` |
| Path | file pipeline via `file_transcribe` (`push_mono` + `finish()`) |
| Wall time | ~22 min transcribe (~0.34× realtime) |

`MTG_32021` failed on the first helper process (MPSGraph cache load error); a one-meeting retry succeeded. Aggregates include that retry.

| | WER |
| --- | ---: |
| **Macro** | **41.2%** |
| **Micro** | **41.8%** |

15,465 reference words vs 11,842 hypothesis words.

| Meeting | Duration | Device | Ref words | Hyp words | S | I | D | WER |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MTG_32000 | 6.1m | meetup_0 | 1529 | 1175 | 152 | 107 | 461 | 47.1% |
| MTG_32003 | 6.3m | meetup_0 | 1463 | 1180 | 86 | 112 | 395 | 40.5% |
| MTG_32004 | 6.4m | meetup_0 | 1554 | 1291 | 76 | 161 | 424 | 42.5% |
| MTG_32005 | 7.7m | meetup_0 | 1579 | 1153 | 83 | 21 | 447 | 34.9% |
| MTG_32006 | 6.4m | meetup_0 | 1703 | 1352 | 134 | 102 | 453 | 40.5% |
| MTG_32007 | 6.2m | meetup_0 | 1423 | 1111 | 96 | 105 | 417 | 43.4% |
| MTG_32008 | 7.3m | meetup_0 | 2125 | 1460 | 244 | 92 | 757 | 51.4% |
| MTG_32009 | 5.9m | meetup_0 | 1243 | 1017 | 56 | 66 | 292 | 33.3% |
| MTG_32020 | 6.0m | plaza_0 | 1480 | 1083 | 77 | 60 | 457 | 40.1% |
| MTG_32021 | 6.0m | meetup_0 | 1366 | 1020 | 58 | 60 | 406 | 38.4% |
| **macro** | | | | | | | | **41.2%** |
| **micro** | **64.2m** | | **15465** | **11842** | **1062** | **886** | **4509** | **41.8%** |

---

## Nemotron 3.5 ASR Streaming 0.6B CoreML INT8

| Item | Value |
| --- | --- |
| Date | 2026-09-11 |
| Branch | `experiement/nvidia-parakeet-model` |
| Path | file pipeline via `file_transcribe` (`push_mono` + `finish()`) |
| Wall time | **8.7 min** transcribe (~0.14× realtime) |

All 10 meetings succeeded on the first pass.

| | WER |
| --- | ---: |
| **Macro** | **39.1%** |
| **Micro** | **39.5%** |

15,465 reference words vs 10,604 hypothesis words.

| Meeting | Duration | Device | Ref words | Hyp words | S | I | D | WER |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MTG_32000 | 6.1m | meetup_0 | 1529 | 1002 | 103 | 15 | 542 | 43.2% |
| MTG_32003 | 6.3m | meetup_0 | 1463 | 1002 | 100 | 8 | 469 | 39.4% |
| MTG_32004 | 6.4m | meetup_0 | 1554 | 1128 | 77 | 14 | 440 | 34.2% |
| MTG_32005 | 7.7m | meetup_0 | 1579 | 1196 | 113 | 15 | 398 | 33.3% |
| MTG_32006 | 6.4m | meetup_0 | 1703 | 1131 | 107 | 22 | 594 | 42.5% |
| MTG_32007 | 6.2m | meetup_0 | 1423 | 956 | 84 | 11 | 478 | 40.3% |
| MTG_32008 | 7.3m | meetup_0 | 2125 | 1253 | 129 | 15 | 887 | 48.5% |
| MTG_32009 | 5.9m | meetup_0 | 1243 | 892 | 91 | 8 | 359 | 36.9% |
| MTG_32020 | 6.0m | plaza_0 | 1480 | 1045 | 83 | 19 | 454 | 37.6% |
| MTG_32021 | 6.0m | meetup_0 | 1366 | 999 | 88 | 11 | 378 | 34.9% |
| **macro** | | | | | | | | **39.1%** |
| **micro** | **64.2m** | | **15465** | **10604** | **975** | **138** | **4999** | **39.5%** |

---

## xAI Speech-to-Text (batch `POST /v1/stt`)

| Item | Value |
| --- | --- |
| Date | 2026-09-11 |
| Branch | `experiement/nvidia-parakeet-model` (eval harness) |
| Path | HTTP batch, `language=en`, `format=true`, `model=grok-voice-transcribe-2.0`, full WAV upload |
| Wall time | **82 s** API time (~0.02× realtime) |

Not the production WebSocket path. This is the xAI quality ceiling on the same files.

| | WER |
| --- | ---: |
| **Macro** | **34.6%** |
| **Micro** | **35.2%** |

15,465 reference words vs 11,555 hypothesis words.

| Meeting | Duration | Device | Ref words | Hyp words | S | I | D | WER |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MTG_32000 | 6.1m | meetup_0 | 1529 | 1045 | 103 | 12 | 496 | 40.0% |
| MTG_32003 | 6.3m | meetup_0 | 1463 | 1145 | 102 | 22 | 340 | 31.7% |
| MTG_32004 | 6.4m | meetup_0 | 1554 | 1188 | 90 | 19 | 385 | 31.8% |
| MTG_32005 | 7.7m | meetup_0 | 1579 | 1312 | 95 | 22 | 289 | 25.7% |
| MTG_32006 | 6.4m | meetup_0 | 1703 | 1258 | 143 | 22 | 467 | 37.1% |
| MTG_32007 | 6.2m | meetup_0 | 1423 | 1017 | 107 | 22 | 428 | 39.1% |
| MTG_32008 | 7.3m | meetup_0 | 2125 | 1348 | 178 | 20 | 797 | 46.8% |
| MTG_32009 | 5.9m | meetup_0 | 1243 | 1044 | 95 | 25 | 224 | 27.7% |
| MTG_32020 | 6.0m | plaza_0 | 1480 | 1150 | 95 | 35 | 365 | 33.5% |
| MTG_32021 | 6.0m | meetup_0 | 1366 | 1048 | 98 | 12 | 330 | 32.2% |
| **macro** | | | | | | | | **34.6%** |
| **micro** | **64.2m** | | **15465** | **11555** | **1106** | **211** | **4121** | **35.2%** |

Best: `MTG_32005` at 25.7%. Worst: `MTG_32008` at 46.8%.

---

## Nemotron Labs Unified ASR 0.6B CoreML INT8 (`FluidAudio 0.18.4`)

| Item | Value |
| --- | --- |
| Date | 2026-11-23 |
| Branch | `feat/nemotron-labs-unified-asr` |
| Artifact | `FluidInference/nemotron-labs-unified-asr-0.6b-coreml` (`coreml/`, ~602 MB INT8) |
| Path | file pipeline via `file_transcribe` (`push_mono` + `finish()`, cursor-based continuous context commits) |

### 5-meeting configuration sweep (`MTG_32000`–`MTG_32006`, 32.9 min, 7,828 ref words)

| Configuration | Macro WER | Micro WER | S | I | D | Transcribe wall |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nemotron 3.5 320 ms INT8 (`speech-swift` baseline) | 38.51% | 38.54% | 500 | 74 | 2,443 | 252.4 s |
| Unified `560 ms` INT8 (EOU reset) | 39.33% | 39.33% | 418 | 59 | 2,602 | 382.0 s |
| Unified `560 ms` FP16 (EOU reset) | 39.24% | 39.24% | 420 | 58 | 2,594 | 489.5 s |
| Unified `1120 ms` INT8 (EOU reset) | 38.79% | 38.80% | 417 | 50 | 2,570 | 137.5 s |
| Unified `1120 ms` FP16 (EOU reset) | 38.97% | 38.98% | 419 | 50 | 2,582 | 162.1 s |
| Unified `1120 ms` INT8 (continuous context) | 38.31% | 38.35% | 383 | 47 | 2,572 | 142.7 s |
| Unified `2080 ms` INT8 (EOU reset) | 38.13% | 38.13% | 408 | 46 | 2,531 | 94.7 s |
| Unified `2080 ms` INT8 (continuous context) | **37.81%** | **37.84%** | **373** | **46** | 2,543 | 105.7 s |

Key findings from the sweep:
- **INT8 matches or beats FP16** on English NOTSOFAR while running faster at half the disk footprint (602 MB vs ~1.15 GB).
- **Keeping the 5.6 s left-context window warm across pauses** (cursor-based utterance commits instead of calling `manager.reset()`) saves **0.32–0.48 pp WER** and cuts substitutions further.

### Full 10-meeting run — Default `1120 ms INT8` (`70_7_7_int8`, 4.65 min total wall / ~0.07× realtime)

| Meeting | Duration | Device | Ref words | Hyp words | S | I | D | WER |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MTG_32000 | 6.1m | meetup_0 | 1529 | 940 | 76 | 5 | 594 | 44.1% |
| MTG_32003 | 6.3m | meetup_0 | 1463 | 1020 | 73 | 9 | 452 | 36.5% |
| MTG_32004 | 6.4m | meetup_0 | 1554 | 1076 | 57 | 8 | 486 | 35.5% |
| MTG_32005 | 7.7m | meetup_0 | 1579 | 1123 | 62 | 15 | 471 | 34.7% |
| MTG_32006 | 6.4m | meetup_0 | 1703 | 1144 | 115 | 10 | 569 | 40.8% |
| MTG_32007 | 6.2m | meetup_0 | 1423 | 914 | 91 | 12 | 521 | 43.9% |
| MTG_32008 | 7.3m | meetup_0 | 2125 | 1248 | 139 | 11 | 888 | 48.9% |
| MTG_32009 | 5.9m | meetup_0 | 1243 | 892 | 73 | 11 | 362 | 35.9% |
| MTG_32020 | 6.0m | plaza_0 | 1480 | 1033 | 76 | 14 | 461 | 37.2% |
| MTG_32021 | 6.0m | meetup_0 | 1366 | 923 | 61 | 5 | 448 | 37.6% |
| **macro** | | | | | | | | **39.5%** |
| **micro** | **64.2m** | | **15465** | **10313** | **823** | **100** | **5252** | **39.9%** |

### Full 10-meeting run — `2080 ms INT8` (`70_13_13_int8`, 2.86 min total wall / ~0.044× realtime)

| Meeting | Duration | Device | Ref words | Hyp words | S | I | D | WER |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| MTG_32000 | 6.1m | meetup_0 | 1529 | 952 | 55 | 7 | 584 | 42.2% |
| MTG_32003 | 6.3m | meetup_0 | 1463 | 1009 | 70 | 8 | 462 | 36.9% |
| MTG_32004 | 6.4m | meetup_0 | 1554 | 1081 | 66 | 8 | 481 | 35.7% |
| MTG_32005 | 7.7m | meetup_0 | 1579 | 1149 | 82 | 13 | 443 | 34.1% |
| MTG_32006 | 6.4m | meetup_0 | 1703 | 1140 | 100 | 10 | 573 | 40.1% |
| MTG_32007 | 6.2m | meetup_0 | 1423 | 905 | 73 | 11 | 529 | 43.1% |
| MTG_32008 | 7.3m | meetup_0 | 2125 | 1255 | 142 | 12 | 882 | 48.8% |
| MTG_32009 | 5.9m | meetup_0 | 1243 | 896 | 63 | 8 | 355 | 34.3% |
| MTG_32020 | 6.0m | plaza_0 | 1480 | 1012 | 61 | 13 | 481 | 37.5% |
| MTG_32021 | 6.0m | meetup_0 | 1366 | 925 | 63 | 4 | 445 | 37.5% |
| **macro** | | | | | | | | **39.0%** |
| **micro** | **64.2m** | | **15465** | **10327** | **775** | **94** | **5235** | **39.5%** |

On far-field overlapped NOTSOFAR audio, Unified ASR dramatically lowers word substitutions (**−15.6%** at 1120 ms, **−20.5%** at 2080 ms) and insertions (**−27.5%** / **−31.9%**) while running **2–3× faster** than Nemotron 3.5; slightly more quiet far-field deletions keep overall NOTSOFAR WER within −0.1 to +0.4 pp of Nemotron 3.5.

Eval driver: [`apps/amie/scripts/eval_notsofar.py`](../../apps/amie/scripts/eval_notsofar.py).
