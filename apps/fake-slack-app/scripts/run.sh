#!/usr/bin/env bash
# Builds if needed, then runs the app in the foreground so its log (who is
# marked speaking, mute toggles, and when) prints here. Ctrl-C quits it.
#
#   pnpm fake-slack --participants 3 --scenario conversation
#
# Runs the binary inside the bundle directly, not through `open`: same bundle
# id for Amie's lookup, but stdout stays attached and arguments pass through.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Quiet unless the build fails.
if ! build_log="$(bash "$ROOT/scripts/build-app.sh" 2>&1)"; then
  echo "$build_log" >&2
  exit 1
fi

# pnpm may forward a leading "--".
if [[ "${1:-}" == "--" ]]; then
  shift
fi

# Scenario names resolve against the shipped ones; relative paths against the
# directory the command was typed in, not this package.
export FAKE_SLACK_SCENARIOS_DIR="$ROOT/scenarios"
cd "${INIT_CWD:-$PWD}"
exec "$ROOT/build/FakeSlack.app/Contents/MacOS/fake-slack" "$@"
