#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/prepare-nemotron-sidecar.sh"

case "$(uname -m)" in
  arm64)
    export CARGO_TARGET_AARCH64_APPLE_DARWIN_RUNNER="$ROOT/scripts/macos-exec-runner.sh"
    ;;
  x86_64)
    export CARGO_TARGET_X86_64_APPLE_DARWIN_RUNNER="$ROOT/scripts/macos-exec-runner.sh"
    ;;
esac

exec "$ROOT/node_modules/.bin/tauri" "$@"
