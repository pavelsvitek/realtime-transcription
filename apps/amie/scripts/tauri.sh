#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/macos-signing.sh
source "$ROOT/scripts/lib/macos-signing.sh"

"$ROOT/scripts/prepare-nemotron-sidecar.sh"

case "$(uname -m)" in
  arm64)
    export CARGO_TARGET_AARCH64_APPLE_DARWIN_RUNNER="$ROOT/scripts/macos-exec-runner.sh"
    ;;
  x86_64)
    export CARGO_TARGET_X86_64_APPLE_DARWIN_RUNNER="$ROOT/scripts/macos-exec-runner.sh"
    ;;
esac

TAURI="$ROOT/node_modules/.bin/tauri"

# `pnpm tauri build`: sign the release app with a real identity, or fail.
# Tauri leaves the bundle ad-hoc / linker-signed when given none, and then every
# build is a different app to macOS: the Accessibility grant is lost on update.
# `-h/--help` and other subcommands skip all of this.
wants_release_signing() {
  [[ "${1:-}" == "build" ]] || return 1
  local arg
  for arg in "$@"; do
    [[ "$arg" == "-h" || "$arg" == "--help" ]] && return 1
  done
  return 0
}

if ! wants_release_signing "$@"; then
  exec "$TAURI" "$@"
fi

if [[ -n "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Signing release build with APPLE_SIGNING_IDENTITY." >&2
elif amie_resolve_signing_identity; then
  export APPLE_SIGNING_IDENTITY="$AMIE_IDENTITY_HASH"
  echo "Signing release build as \"$AMIE_IDENTITY_NAME\"." >&2
elif [[ "${AMIE_ALLOW_ADHOC:-}" == "1" ]]; then
  echo "warning: AMIE_ALLOW_ADHOC=1: building without a signing identity." >&2
else
  echo "error: $AMIE_NO_IDENTITY_HELP" >&2
  echo >&2
  echo "To build anyway (permissions will not persist across builds): AMIE_ALLOW_ADHOC=1 pnpm tauri build" >&2
  exit 1
fi

status=0
"$TAURI" "$@" || status=$?
if [[ "$status" -ne 0 || "${AMIE_ALLOW_ADHOC:-}" == "1" ]]; then
  exit "$status"
fi

# Verify what was built, since the whole point is the signature.
failed=0
found=0
while IFS= read -r app; do
  found=1
  if codesign --verify --deep --strict "$app" 2>/dev/null && amie_requirement_is_stable "$app"; then
    echo "Verified: $app" >&2
    echo "  requirement: $(amie_designated_requirement "$app")" >&2
  else
    echo "error: $app is not signed with a stable identity (requirement: $(amie_designated_requirement "$app"))." >&2
    failed=1
  fi
done < <(find "$ROOT/src-tauri/target" -type d -name 'Amie.app' -path '*/release/bundle/macos/*' -maxdepth 8 2>/dev/null)

if [[ "$found" -eq 0 ]]; then
  echo "note: no release Amie.app found to verify (building only a dmg or another target?)." >&2
elif [[ "$failed" -eq 0 ]]; then
  echo "note: if Amie was allowed under Accessibility before this build and now shows Off, that entry belongs to the old ad-hoc signature." >&2
  echo "      Remove it with - in System Settings -> Privacy & Security -> Accessibility, reopen Amie, and allow it once." >&2
fi
exit "$failed"
