#!/usr/bin/env bash
# Cargo target runner: receives the built binary path as $1.
# Launches via `open` from a dev .app bundle so LaunchServices attributes
# system-audio TCC to com.pavel.tauri-app (exec from a terminal does not).
set -euo pipefail

BINARY="${1:?missing binary path}"
shift

if [[ "$BINARY" != /* ]]; then
  BINARY="$(cd "${CARGO_MANIFEST_DIR:-$(pwd)}" && cd "$(dirname "$BINARY")" && pwd)/$(basename "$BINARY")"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/debug/tauri-app-dev.app"
MACOS_DIR="$APP/Contents/MacOS"
RESOURCES_DIR="$APP/Contents/Resources"
INFO_PLIST="$APP/Contents/Info.plist"
WRAPPER="$MACOS_DIR/tauri-app"
REAL_BINARY="$MACOS_DIR/tauri-app-bin"
ENV_FILE="$RESOURCES_DIR/dev-runner.env"

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"
cp "$ROOT/src-tauri/Info.plist" "$INFO_PLIST"
cp "$BINARY" "$REAL_BINARY"
chmod +x "$REAL_BINARY"

{
  for var in DEBUG_SAVE RUST_LOG NEMOTRON_BRIDGE_PATH NEMOTRON_SPEECH_RMS_THRESHOLD NEMOTRON_EOU_SILENCE_MS NEMOTRON_MIN_SPEECH_MS TRANSCRIPTION_AUDIO_SOURCE; do
    if [[ -n "${!var:-}" ]]; then
      printf 'export %s=%q\n' "$var" "${!var}"
    fi
  done
} >"$ENV_FILE"

cat >"$WRAPPER" <<'EOF'
#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
RES="$(cd "$HERE/../Resources" && pwd)"
if [[ -f "$RES/dev-runner.env" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$RES/dev-runner.env"
  set +a
fi
exec "$HERE/tauri-app-bin" "$@"
EOF
chmod +x "$WRAPPER"

if command -v codesign >/dev/null 2>&1; then
  codesign -s - --force --deep --identifier com.pavel.tauri-app \
    --entitlements "$ROOT/src-tauri/Entitlements.plist" \
    "$APP" 2>/dev/null || codesign -s - --force --deep "$APP"
fi

exec open -W -n "$APP" --args "$@"
