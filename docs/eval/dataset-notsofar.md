# NOTSOFAR eval-small — local ASR

Speaker-agnostic WER on [NOTSOFAR-1](https://huggingface.co/datasets/microsoft/NOTSOFAR) eval-small far-field single-channel meetings. Same 10 meetings, file pipeline (no loopback). Official NOTSOFAR ranking uses speaker-attributed tcpWER; these runs do not diarize, so scores are concatenated word WER ([`eval_wer.py`](../../tauri-app/scripts/eval_wer.py)).

Reproduce:

```bash
cd tauri-app
python3 scripts/eval_notsofar.py --n-meetings 10 --backends local
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

Nemotron is **better and faster** on this set: **−2.2 pp micro WER**, **~2.5×** lower transcribe wall time.

| | WhisperKit large-v3 (626MB) | Nemotron 3.5 ASR 0.6B INT8 | Δ (Nemotron − WhisperKit) |
| --- | ---: | ---: | ---: |
| Macro WER | 41.2% | **39.1%** | **−2.1 pp** |
| Micro WER | 41.8% | **39.5%** | **−2.2 pp** |
| Hypothesis words | 11,842 | 10,604 | −1,238 |
| Substitutions | 1,062 | 975 | −87 |
| Insertions | 886 | **138** | **−748** |
| Deletions | 4,509 | 4,999 | +490 |
| Transcribe wall | ~22 min | **~8.7 min** | ~2.5× faster |
| Meetings won | 2 | **8** | |

Both models miss a lot of overlapped far-field speech (deletions dominate). WhisperKit hallucinates more (insertions 886 vs 138). Nemotron is more conservative: fewer invented words, slightly more dropped words, still lower overall WER.

Per-meeting WER (lower is better; negative Δ means Nemotron wins):

| Meeting | WhisperKit | Nemotron | Δ |
| --- | ---: | ---: | ---: |
| MTG_32000 | 47.1% | **43.2%** | −3.9 |
| MTG_32003 | 40.5% | **39.4%** | −1.1 |
| MTG_32004 | 42.5% | **34.2%** | −8.3 |
| MTG_32005 | 34.9% | **33.3%** | −1.6 |
| MTG_32006 | **40.5%** | 42.5% | +2.0 |
| MTG_32007 | 43.4% | **40.3%** | −3.1 |
| MTG_32008 | 51.4% | **48.5%** | −2.9 |
| MTG_32009 | **33.3%** | 36.9% | +3.6 |
| MTG_32020 | 40.1% | **37.6%** | −2.5 |
| MTG_32021 | 38.4% | **34.9%** | −3.5 |

Largest Nemotron gain: `MTG_32004` (−8.3 pp). WhisperKit wins only `MTG_32006` and `MTG_32009`.

Neither is close to the ~3% file-pipeline WER on the clean YouTube golden clip. Far-field multi-talker audio is the hard part, not the local decoder plumbing.

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

Best: `MTG_32005` at 33.3%. Worst: `MTG_32008` at 48.5% (same hardest meeting as WhisperKit).

Eval driver: [`tauri-app/scripts/eval_notsofar.py`](../../tauri-app/scripts/eval_notsofar.py).
