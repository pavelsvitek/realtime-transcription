#!/usr/bin/env bash
# Bump the Amie app version in the three files that carry it, in lockstep.
#   bump-version.sh <X.Y.Z | patch | minor | major>
# Run from the repo root (or a worktree of it). Prints the new version.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
TAURI="$ROOT/apps/amie/src-tauri"
CONF="$TAURI/tauri.conf.json"
CARGO="$TAURI/Cargo.toml"
LOCK="$TAURI/Cargo.lock"

arg="${1:?usage: bump-version.sh <X.Y.Z|patch|minor|major>}"

current="$(jq -r .version "$CONF")"
cargo_current="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$CARGO" | head -n 1)"
if [ "$current" != "$cargo_current" ]; then
  echo "tauri.conf.json ($current) and Cargo.toml ($cargo_current) already differ; fix that first." >&2
  exit 1
fi

IFS=. read -r major minor patch <<<"$current"
case "$arg" in
  patch) new="$major.$minor.$((patch + 1))" ;;
  minor) new="$major.$((minor + 1)).0" ;;
  major) new="$((major + 1)).0.0" ;;
  *)
    [[ "$arg" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a version: $arg" >&2; exit 1; }
    new="$arg"
    ;;
esac
[ "$new" != "$current" ] || { echo "version is already $current" >&2; exit 1; }

# Only the first match in each file: [package] in Cargo.toml, the root key in tauri.conf.json.
replace_first() { # file, awk regex, old, new
  awk -v re="$2" -v old="$3" -v new="$4" '
    !done && $0 ~ re { sub(old, new); done = 1 } { print }
    END { if (!done) exit 1 }' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
}
replace_first "$CONF" '^  "version": "' "\"$current\"" "\"$new\""
replace_first "$CARGO" '^version = "' "\"$current\"" "\"$new\""

# Cargo.lock: the version line right after name = "amie".
awk -v old="\"$current\"" -v new="\"$new\"" '
  hit && /^version = / { sub(old, new); hit = 0; done = 1 }
  /^name = "amie"$/ { hit = 1 }
  { print }
  END { if (!done) exit 1 }' "$LOCK" > "$LOCK.tmp" && mv "$LOCK.tmp" "$LOCK"

# Verify all three agree.
v1="$(jq -r .version "$CONF")"
v2="$(sed -nE 's/^version = "([^"]+)".*/\1/p' "$CARGO" | head -n 1)"
v3="$(grep -A1 '^name = "amie"$' "$LOCK" | sed -nE 's/^version = "([^"]+)".*/\1/p')"
if [ "$v1" != "$new" ] || [ "$v2" != "$new" ] || [ "$v3" != "$new" ]; then
  echo "bump failed: conf=$v1 cargo=$v2 lock=$v3 (wanted $new)" >&2
  exit 1
fi
echo "$new"
