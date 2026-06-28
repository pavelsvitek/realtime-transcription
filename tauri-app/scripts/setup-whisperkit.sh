#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HELPER_DIR="$ROOT/whisperkit-helper"
CACHE_DIR="$HOME/Library/Application Support/com.pavel.tauri-app/models/whisperkit"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "WhisperKit setup requires macOS." >&2
  exit 1
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install full Xcode and select it with xcode-select." >&2
  exit 1
fi

echo "Building whisperkit-bridge..." >&2
(cd "$HELPER_DIR" && swift build -c release --product whisperkit-bridge)

BIN="$HELPER_DIR/.build/release/whisperkit-bridge"

echo "Provisioning WhisperKit cache (CoreML models + tokenizer + warm specialization)..." >&2
echo "This is idempotent — skips work when the cache is already complete." >&2
"$BIN" --download-only --cache-dir "$CACHE_DIR"

echo "Helper binary: $BIN"
echo "Model cache: $CACHE_DIR"
