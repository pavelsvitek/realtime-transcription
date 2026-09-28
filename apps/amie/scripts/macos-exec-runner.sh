#!/usr/bin/env bash
# Cargo target runner: receives the built binary path as $1.
# Launches via `open` from a dev .app bundle so LaunchServices attributes
# system-audio TCC to com.pavel.amie (exec from a terminal does not).
#
# Do not `exec open -n`: LaunchServices then owns the window, Cargo's SIGTERM
# only kills this launcher, and `-n` stacks another instance on every rebuild.
set -euo pipefail

BINARY="${1:?missing binary path}"
shift

if [[ "$BINARY" != /* ]]; then
  BINARY="$(cd "${CARGO_MANIFEST_DIR:-$(pwd)}" && cd "$(dirname "$BINARY")" && pwd)/$(basename "$BINARY")"
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/debug/amie-dev.app"
MACOS_DIR="$APP/Contents/MacOS"
RESOURCES_DIR="$APP/Contents/Resources"
INFO_PLIST="$APP/Contents/Info.plist"
WRAPPER="$MACOS_DIR/amie"
REAL_BINARY="$MACOS_DIR/amie-bin"
ENV_FILE="$RESOURCES_DIR/dev-runner.env"
PIDFILE="$ROOT/src-tauri/target/debug/amie-dev.runner.pid"

kill_bundle_bins() {
  local pids
  pids="$(pgrep -f "$REAL_BINARY" || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.2
    pids="$(pgrep -f "$REAL_BINARY" || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

owns_pidfile() {
  [[ -f "$PIDFILE" ]] && [[ "$(cat "$PIDFILE" 2>/dev/null || true)" == "$$" ]]
}

cleanup() {
  if owns_pidfile; then
    rm -f "$PIDFILE"
    kill_bundle_bins
  fi
}

trap cleanup EXIT INT TERM HUP

# Drop leftover windows from a previous cargo run / Ctrl-C before we replace the binary.
kill_bundle_bins

install_if_changed() {
  local src="$1" dest="$2"
  if [[ -f "$dest" ]] && cmp -s "$src" "$dest"; then
    return 1
  fi
  cp "$src" "$dest"
  return 0
}

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$(dirname "$PIDFILE")"
CHANGED=0
if install_if_changed "$ROOT/src-tauri/Info.plist" "$INFO_PLIST"; then
  CHANGED=1
fi
if install_if_changed "$BINARY" "$REAL_BINARY"; then
  CHANGED=1
fi
chmod +x "$REAL_BINARY"

{
  for var in DEBUG_SAVE RUST_LOG NEMOTRON_BRIDGE_PATH NEMOTRON_SPEECH_RMS_THRESHOLD NEMOTRON_EOU_SILENCE_MS NEMOTRON_MIN_SPEECH_MS TRANSCRIPTION_AUDIO_SOURCE GENERATE_ALL_MEETING_SUMMARIES; do
    if [[ -n "${!var:-}" ]]; then
      printf 'export %s=%q\n' "$var" "${!var}"
    fi
  done
} >"$ENV_FILE"

WRAPPER_SRC="$(mktemp)"
cat >"$WRAPPER_SRC" <<'EOF'
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
exec "$HERE/amie-bin" "$@"
EOF
if install_if_changed "$WRAPPER_SRC" "$WRAPPER"; then
  CHANGED=1
fi
rm -f "$WRAPPER_SRC"
chmod +x "$WRAPPER"

# Ad-hoc --force signing mints a new cdhash. Accessibility TCC follows that
# hash, so a re-sign on every launch asks again even when the binary is the same.
if [[ "$CHANGED" -eq 1 ]] || [[ ! -e "$APP/Contents/_CodeSignature" ]]; then
  if command -v codesign >/dev/null 2>&1; then
    codesign -s - --force --deep --identifier com.pavel.amie \
      --entitlements "$ROOT/src-tauri/Entitlements.plist" \
      "$APP" 2>/dev/null || codesign -s - --force --deep "$APP"
  fi
fi

echo $$ >"$PIDFILE"

# No `-n`: one instance. No `exec`: this shell must keep the trap so Cargo
# rebuild/Ctrl-C actually quits the .app LaunchServices spawned.
open -W "$APP" --args "$@"
