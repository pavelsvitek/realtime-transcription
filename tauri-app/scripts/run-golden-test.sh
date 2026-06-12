#!/usr/bin/env bash
# Golden transcript evaluation for tauri-app.
#
# Usage:
#   ./scripts/run-golden-test.sh              # eval Phase 1 transcript vs reference
#   ./scripts/run-golden-test.sh --e2e        # full macOS loopback + ffplay run (~2 min)
#   ./scripts/run-golden-test.sh --update-baseline
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REF="$ROOT/test-youtube-video.txt"
VIDEO="$ROOT/test-youtube-video.mp4"
HYP="${HYPOTHESIS:-$ROOT/test-output/transcript.txt}"
BASELINE="$ROOT/test-output/baseline/report.json"
RUN_E2E=0
UPDATE_BASELINE=0
SAVE_RUN=1

for arg in "$@"; do
  case "$arg" in
    --e2e) RUN_E2E=1 ;;
    --update-baseline) UPDATE_BASELINE=1 ;;
    --no-save-run) SAVE_RUN=0 ;;
  esac
done

run_eval() {
  local hyp="$1"
  local extra=()
  if [[ "$UPDATE_BASELINE" -eq 1 ]]; then
    extra+=(--update-baseline)
  fi
  if [[ "$SAVE_RUN" -eq 1 ]]; then
    extra+=(--save-run)
  fi
  if [[ "${SKIP_BASELINE:-0}" -eq 1 ]]; then
    extra+=(--skip-baseline)
  fi
  python3 "$ROOT/scripts/eval_wer.py" "$REF" "$hyp" --baseline "$BASELINE" "${extra[@]}"
}

if [[ "$RUN_E2E" -eq 1 ]]; then
  if [[ "$(uname)" != "Darwin" ]]; then
    echo "E2E golden test requires macOS (system audio loopback)" >&2
    exit 1
  fi
  if ! command -v ffplay >/dev/null 2>&1; then
    echo "ffplay not found (install ffmpeg)" >&2
    exit 1
  fi
  if [[ ! -f "$VIDEO" ]]; then
    echo "Missing video: $VIDEO" >&2
    exit 1
  fi

  E2E_OUT="$ROOT/test-output/e2e-transcript.txt"
  mkdir -p "$ROOT/test-output"

  echo "Running headless golden E2E (cargo test)..." >&2
  (cd "$ROOT/src-tauri" && cargo test golden_system_audio_e2e -- --ignored --nocapture)

  if [[ -f "$ROOT/test-output/e2e-transcript.txt" ]]; then
    HYP="$ROOT/test-output/e2e-transcript.txt"
    SKIP_BASELINE=1
  fi
fi

SKIP_BASELINE="${SKIP_BASELINE:-0}"

if [[ ! -f "$REF" ]]; then
  echo "Missing reference: $REF" >&2
  exit 1
fi
if [[ ! -f "$HYP" ]]; then
  echo "Missing hypothesis: $HYP" >&2
  echo "Run Phase 1 manually or use --e2e" >&2
  exit 1
fi

echo "Evaluating:" >&2
echo "  reference:  $REF" >&2
echo "  hypothesis: $HYP" >&2
run_eval "$HYP"

echo "Running Rust WER unit tests..." >&2
(cd "$ROOT/src-tauri" && cargo test eval:: --quiet)
