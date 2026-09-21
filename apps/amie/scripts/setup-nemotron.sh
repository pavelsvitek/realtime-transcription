#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_DIR="$ROOT/nemotron-helper"
CACHE_ROOT="$HOME/Library/Application Support/com.pavel.amie/models/nemotron"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Nemotron setup requires macOS." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install full Xcode and select it with xcode-select." >&2
  exit 1
fi

echo "Building nemotron-bridge..." >&2
(cd "$HELPER_DIR" && swift build -c release --product nemotron-bridge)

BIN="$HELPER_DIR/.build/release/nemotron-bridge"

echo "Provisioning the Nemotron 3.5 CoreML INT8 model..." >&2
echo "This is idempotent and skips the download when the bundle is complete." >&2
"$BIN" --download-only --cache-dir "$CACHE_ROOT"

MODEL_DIR="$CACHE_ROOT/qwen3-speech/models/aufklarer/Nemotron-3.5-ASR-Streaming-0.6B-CoreML-INT8"
echo "Helper binary: $BIN"
echo "Model bundle: $MODEL_DIR"
