# Golden Dataset

Reference transcripts for validating chunked (real-time) transcription quality via Word Error Rate (WER).

## Layout

```
golden-dataset/
├── clips/          # MP4 files (gitignored — place locally)
└── transcripts/    # Reference transcripts (committed to git)
```

Each clip has a matching pair:

| Clip | Reference transcript |
| --- | --- |
| `clips/<name>.mp4` | `transcripts/<name>.txt` |

Videos are **not** stored in git. Reference transcripts **are** committed.

## Reference transcript policy

Reference transcripts are fixed ground truth. Review and correct them manually against the source audio. Never generate a reference with the ASR model being evaluated; doing so lets the candidate grade itself.

The E2E golden test (`pnpm test:golden:e2e`) plays the clip through system-audio loopback and compares Nemotron output against this fixed reference.

## Prerequisites

One-time Nemotron setup:

```bash
./scripts/setup-nemotron.sh
```

`ffmpeg` must be on your `PATH`.

## Add a new golden clip

1. Place the MP4 in `golden-dataset/clips/`:

   ```bash
   cp /path/to/my-clip.mp4 golden-dataset/clips/my-clip.mp4
   ```

2. Transcribe the clip manually, review every word against the audio, and write `golden-dataset/transcripts/my-clip.txt`.

3. Commit the reviewed transcript:

   ```bash
   git add golden-dataset/transcripts/my-clip.txt
   ```

## Run golden tests

| Phase | What | Command |
| --- | --- | --- |
| File pipeline diagnostic | Model quality without loopback loss | `cd src-tauri && cargo test diagnose_model_vs_commit_strategy -- --ignored --nocapture` |
| E2E | Headless system-audio + `ffplay` (~2 min) | `pnpm test:golden:e2e` |
| Phase 1 (manual) | Play video in Chrome, save transcript | (UI) → `pnpm test:golden` |

The primary clip is `test-youtube-video`. Place it at:

```
golden-dataset/clips/test-youtube-video.mp4
```

Source: [Chamath Rips Cloudflare CEO’s Layoff Memo](https://www.youtube.com/watch?v=ZJFevnwiCww).

Reference transcript (already committed):

```
golden-dataset/transcripts/test-youtube-video.txt
```

E2E WER gate: `GOLDEN_E2E_MAX_WER` defaults to `0.05` (5%).

## Artifacts

- `test-output/e2e-transcript.txt` — E2E hypothesis output (gitignored)
- `test-output/baseline/report.json` — regression baseline (committed)
- `test-output/runs/<timestamp>/` — dated eval reports (gitignored)

See also [../README.md](../README.md) for setup and [../../docs/technical/realtime-transcription.md](../../docs/technical/realtime-transcription.md) for the streaming architecture.
