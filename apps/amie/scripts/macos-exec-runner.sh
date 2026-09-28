#!/usr/bin/env bash
# Cargo target runner: receives the built binary path as $1.
# Launches via `open` from a dev .app bundle so LaunchServices attributes
# system-audio TCC to com.pavel.amie (exec from a terminal does not).
#
# The binary lives at Contents/MacOS/amie, matching CFBundleExecutable, so
# Accessibility TCC applies to this process. A shell wrapper that exec'd
# amie-bin was a different executable than the bundle claimed.
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
REAL_BINARY="$MACOS_DIR/amie"
PIDFILE="$ROOT/src-tauri/target/debug/amie-dev.runner.pid"

kill_matching() {
  local pattern="$1"
  local pids
  pids="$(pgrep -f "$pattern" || true)"
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.2
    pids="$(pgrep -f "$pattern" || true)"
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

kill_bundle_bins() {
  kill_matching "$REAL_BINARY"
  # Previous runner used a wrapper plus amie-bin.
  kill_matching "$MACOS_DIR/amie-bin"
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

write_dev_plist() {
  local dest="$1"
  python3 - "$ROOT/src-tauri/Info.plist" "$dest" <<'PY'
import os
import plistlib
import sys

src, dest = sys.argv[1], sys.argv[2]
with open(src, "rb") as handle:
    plist = plistlib.load(handle)
plist["CFBundleDisplayName"] = "Amie Dev"
plist["CFBundleName"] = "Amie Dev"
keys = (
    "DEBUG_SAVE",
    "RUST_LOG",
    "NEMOTRON_BRIDGE_PATH",
    "NEMOTRON_SPEECH_RMS_THRESHOLD",
    "NEMOTRON_EOU_SILENCE_MS",
    "NEMOTRON_MIN_SPEECH_MS",
    "TRANSCRIPTION_AUDIO_SOURCE",
    "GENERATE_ALL_MEETING_SUMMARIES",
)
env = {key: os.environ[key] for key in keys if os.environ.get(key)}
if env:
    plist["LSEnvironment"] = env
else:
    plist.pop("LSEnvironment", None)
with open(dest, "wb") as handle:
    plistlib.dump(plist, handle)
PY
}

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$(dirname "$PIDFILE")"
CHANGED=0

PLIST_SRC="$(mktemp)"
write_dev_plist "$PLIST_SRC"
if install_if_changed "$PLIST_SRC" "$INFO_PLIST"; then
  CHANGED=1
fi
rm -f "$PLIST_SRC"

if install_if_changed "$BINARY" "$REAL_BINARY"; then
  CHANGED=1
fi
chmod +x "$REAL_BINARY"
rm -f "$MACOS_DIR/amie-bin" "$RESOURCES_DIR/dev-runner.env"

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
