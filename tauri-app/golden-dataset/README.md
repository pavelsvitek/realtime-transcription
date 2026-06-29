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

## How reference transcripts are produced

Reference transcripts come from the **file pipeline**: ffmpeg decodes the entire MP4, audio is fed through WhisperKit in one pass (`push_mono` + `finish()`), and the result is saved. This path has no loopback capture or frame drops, so it represents the best achievable transcription quality for the clip.

The E2E golden test (`pnpm test:golden:e2e`) plays the same clip through system-audio loopback and compares the chunked real-time output against this reference.

## Prerequisites

One-time WhisperKit setup:

```bash
./scripts/setup-whisperkit.sh
```

`ffmpeg` must be on your `PATH`.

## Add a new golden clip

1. Place the MP4 in `golden-dataset/clips/`:

   ```bash
   cp /path/to/my-clip.mp4 golden-dataset/clips/my-clip.mp4
   ```

2. Generate the reference transcript:

   ```bash
   ./scripts/generate-golden-transcript.sh golden-dataset/clips/my-clip.mp4 my-clip
   ```

   This writes `golden-dataset/transcripts/my-clip.txt`.

3. Review the output, then commit the transcript:

   ```bash
   git add golden-dataset/transcripts/my-clip.txt
   ```

The clip name defaults to the MP4 filename without extension if omitted:

```bash
./scripts/generate-golden-transcript.sh golden-dataset/clips/my-clip.mp4
```

## Run golden tests

| Phase | What | Command |
| --- | --- | --- |
| File pipeline diagnostic | Model quality ceiling (no loopback) | `cd src-tauri && cargo test diagnose_model_vs_commit_strategy -- --ignored --nocapture` |
| E2E | Headless system-audio + `ffplay` (~2 min) | `pnpm test:golden:e2e` |
| Phase 1 (manual) | Play video in Chrome, save transcript | (UI) → `pnpm test:golden` |

The primary clip is `test-youtube-video`. Place it at:

```
golden-dataset/clips/test-youtube-video.mp4
```

Reference transcript (already committed):

```
golden-dataset/transcripts/test-youtube-video.txt
```

E2E WER gate: `GOLDEN_E2E_MAX_WER` defaults to `0.05` (5%).

## Artifacts

- `test-output/e2e-transcript.txt` — E2E hypothesis output (gitignored)
- `test-output/baseline/report.json` — regression baseline (committed)
- `test-output/runs/<timestamp>/` — dated eval reports (gitignored)

See also [../README.md](../README.md) for app setup and [../../docs/technical/golden-test-wer-gap.md](../../docs/technical/golden-test-wer-gap.md) for why file-pipeline and E2E WER can differ.
