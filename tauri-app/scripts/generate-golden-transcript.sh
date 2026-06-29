#!/usr/bin/env bash
# Generate a golden reference transcript from an MP4 using the file pipeline.
#
# Usage:
#   ./scripts/generate-golden-transcript.sh <video.mp4> [clip-name]
#
# Examples:
#   ./scripts/generate-golden-transcript.sh golden-dataset/clips/my-clip.mp4
#   ./scripts/generate-golden-transcript.sh golden-dataset/clips/my-clip.mp4 my-clip
#
# Output:
#   golden-dataset/transcripts/<clip-name>.txt
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <video.mp4> [clip-name]" >&2
  exit 1
fi

VIDEO_INPUT="$1"
CLIP_NAME="${2:-$(basename "$VIDEO_INPUT" .mp4)}"

if [[ "$VIDEO_INPUT" = /* ]]; then
  VIDEO_PATH="$VIDEO_INPUT"
else
  VIDEO_PATH="$ROOT/$VIDEO_INPUT"
fi

OUTPUT_PATH="$ROOT/golden-dataset/transcripts/${CLIP_NAME}.txt"
HELPER_BIN="$ROOT/whisperkit-helper/.build/release/whisperkit-bridge"
CACHE_DIR="$HOME/Library/Application Support/com.pavel.tauri-app/models/whisperkit"

if [[ ! -f "$VIDEO_PATH" ]]; then
  echo "Missing video: $VIDEO_PATH" >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found (install ffmpeg)" >&2
  exit 1
fi

if [[ ! -x "$HELPER_BIN" ]]; then
  echo "WhisperKit helper not built. Run tauri-app/scripts/setup-whisperkit.sh first." >&2
  exit 1
fi

echo "Ensuring WhisperKit cache is complete (models + tokenizer)..." >&2
"$HELPER_BIN" --download-only --cache-dir "$CACHE_DIR"

export GOLDEN_VIDEO_PATH="$VIDEO_PATH"
export GOLDEN_OUTPUT_PATH="$OUTPUT_PATH"

echo "Generating golden transcript..." >&2
echo "  video:  $VIDEO_PATH" >&2
echo "  output: $OUTPUT_PATH" >&2

(cd "$ROOT/src-tauri" && cargo test generate_golden_transcript -- --ignored --nocapture)

echo "Done. Review and commit: $OUTPUT_PATH" >&2
