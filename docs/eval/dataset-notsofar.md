# NOTSOFAR eval-small

Speaker-agnostic WER on [NOTSOFAR-1](https://huggingface.co/datasets/microsoft/NOTSOFAR) eval-small far-field single-channel meetings. Same 10 meetings. Official NOTSOFAR ranking uses speaker-attributed tcpWER; these runs do not diarize, so scores are concatenated word WER ([`eval_wer.py`](../../apps/tauri-app/scripts/eval_wer.py)).

Reproduce:

```bash
cd apps/tauri-app
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

| | WhisperKit large-v3 | Nemotron 3.5 0.6B | **xAI batch STT** |
| --- | ---: | ---: | ---: |
| Macro WER | 41.2% | 39.1% | **34.6%** |
| Micro WER | 41.8% | 39.5% | **35.2%** |
| Hypothesis words | 11,842 | 10,604 | 11,555 |
| Substitutions | 1,062 | **975** | 1,106 |
| Insertions | 886 | **138** | 211 |
| Deletions | 4,509 | 4,999 | **4,121** |
| Transcribe wall | ~22 min | ~8.7 min | **~1.4 min** |
| Meetings won (of 10) | 0 | 0 | **10** |

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

Eval driver: [`apps/tauri-app/scripts/eval_notsofar.py`](../../apps/tauri-app/scripts/eval_notsofar.py).
