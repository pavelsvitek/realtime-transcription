#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="$ROOT/nemotron-helper/.build/release/nemotron-bridge"
TARGET_DIR="$ROOT/src-tauri/binaries"

if [[ ! -x "$SOURCE" ]]; then
  echo "Nemotron helper is not built: $SOURCE" >&2
  echo "Run tauri-app/scripts/setup-nemotron.sh first." >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) TARGET_TRIPLE="aarch64-apple-darwin" ;;
  x86_64) TARGET_TRIPLE="x86_64-apple-darwin" ;;
  *)
    echo "Unsupported macOS architecture: $(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p "$TARGET_DIR"
cp "$SOURCE" "$TARGET_DIR/nemotron-bridge-$TARGET_TRIPLE"
chmod +x "$TARGET_DIR/nemotron-bridge-$TARGET_TRIPLE"
