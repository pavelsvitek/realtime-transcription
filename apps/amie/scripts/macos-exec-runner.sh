#!/usr/bin/env bash
# Cargo target runner: receives the built binary path as $1.
# Launches via `open` from a dev .app bundle so LaunchServices attributes
# microphone / system-audio / Accessibility TCC to the app, not the terminal.
#
# Identity, which is what TCC keys every grant on:
#   - bundle id com.pavel.amie.dev, so the dev build never shares a TCC row
#     with the release app (com.pavel.amie). Same id, different signatures
#     made each overwrite the other's grant.
#   - signed with a real certificate (see lib/macos-signing.sh). An ad-hoc
#     signature changes with every build, and TCC then quietly stops matching
#     while System Settings still shows the old row as allowed.
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
# shellcheck source=lib/macos-signing.sh
source "$ROOT/scripts/lib/macos-signing.sh"

DEV_BUNDLE_ID="com.pavel.amie.dev"
APP="$ROOT/src-tauri/target/debug/amie-dev.app"
MACOS_DIR="$APP/Contents/MacOS"
RESOURCES_DIR="$APP/Contents/Resources"
INFO_PLIST="$APP/Contents/Info.plist"
REAL_BINARY="$MACOS_DIR/amie"
PIDFILE="$ROOT/src-tauri/target/debug/amie-dev.runner.pid"
# Digest of what the bundle was built from (see below). Not derived from the
# installed binary: codesign rewrites that copy, so it never equals the build.
STATE_FILE="$ROOT/src-tauri/target/debug/amie-dev.state"

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

write_dev_plist() {
  local dest="$1"
  python3 - "$ROOT/src-tauri/Info.plist" "$dest" "$DEV_BUNDLE_ID" <<'PY'
import os
import plistlib
import sys

src, dest = sys.argv[1], sys.argv[2]
with open(src, "rb") as handle:
    plist = plistlib.load(handle)
plist["CFBundleDisplayName"] = "Amie Dev"
plist["CFBundleName"] = "Amie Dev"
plist["CFBundleIdentifier"] = sys.argv[3]
keys = (
    "DEBUG_SAVE",
    "RUST_LOG",
    "NEMOTRON_BRIDGE_PATH",
    "NEMOTRON_SPEECH_RMS_THRESHOLD",
    "NEMOTRON_EOU_SILENCE_MS",
    "NEMOTRON_MIN_SPEECH_MS",
    "TRANSCRIPTION_AUDIO_SOURCE",
    "GENERATE_ALL_MEETING_SUMMARIES",
    "AMIE_SHOW_ONBOARDING",
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

digest() {
  shasum -a 256 "$1" | cut -d' ' -f1
}

sign_dev_app() {
  local entitlements="$ROOT/src-tauri/Entitlements.plist"
  SIGNED_WITH="-"
  if [[ "$SIGN_ID" != "-" ]]; then
    if amie_codesign "$APP" "$DEV_BUNDLE_ID" "$entitlements"; then
      SIGNED_WITH="$SIGN_ID"
      echo "amie-dev.app signed as \"$SIGN_NAME\"; Accessibility will persist across rebuilds." >&2
      return 0
    fi
    echo "warning: signing with \"$SIGN_NAME\" failed (keychain locked or key access denied?); falling back to ad-hoc." >&2
  else
    echo "warning: $AMIE_NO_IDENTITY_HELP" >&2
  fi
  AMIE_IDENTITY_HASH="-"
  amie_codesign "$APP" "$DEV_BUNDLE_ID" "$entitlements" ||
    codesign --force --sign - --identifier "$DEV_BUNDLE_ID" "$APP"
}

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$(dirname "$PIDFILE")"

PLIST_SRC="$(mktemp)"
write_dev_plist "$PLIST_SRC"

if amie_resolve_signing_identity; then
  SIGN_ID="$AMIE_IDENTITY_HASH"
  SIGN_NAME="$AMIE_IDENTITY_NAME"
else
  SIGN_ID="-"
  SIGN_NAME="ad-hoc"
fi

# Rebuild the bundle only when its inputs changed: the compiled binary, the
# Info.plist (bundle id, env), or the identity. An unchanged bundle keeps its
# signature, and a new identity re-signs it even when the code is the same.
WANT_STATE="$(digest "$BINARY") $(digest "$PLIST_SRC") $SIGN_ID"
if [[ -e "$APP/Contents/_CodeSignature" ]] &&
  [[ "$(cat "$STATE_FILE" 2>/dev/null || true)" == "$WANT_STATE" ]]; then
  :
else
  cp "$PLIST_SRC" "$INFO_PLIST"
  cp "$BINARY" "$REAL_BINARY"
  chmod +x "$REAL_BINARY"
  rm -f "$MACOS_DIR/amie-bin" "$RESOURCES_DIR/dev-runner.env"
  if command -v codesign >/dev/null 2>&1; then
    sign_dev_app
    # Record what was actually used: a failed identity falls back to "-",
    # so the next launch retries the identity.
    echo "$(digest "$BINARY") $(digest "$PLIST_SRC") $SIGNED_WITH" >"$STATE_FILE"
  fi
fi
rm -f "$PLIST_SRC"

echo $$ >"$PIDFILE"

# No `-n`: one instance. No `exec`: this shell must keep the trap so Cargo
# rebuild/Ctrl-C actually quits the .app LaunchServices spawned.
open -W "$APP" --args "$@"
