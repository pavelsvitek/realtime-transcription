# shellcheck shell=bash
# Shared code-signing helpers. Source this file; it defines functions only.
# Written for bash 3.2 (the macOS default).
#
# Why this exists: macOS ties the Accessibility grant to the app's bundle id
# AND its code requirement. An ad-hoc signature (`codesign -s -`) has the
# requirement `cdhash H"..."`, which changes with every build, so each rebuild
# silently invalidates the grant while System Settings still shows it as on.
# A certificate signature has a requirement built from the certificate, which
# does not change when the code does.
#
# Environment:
#   AMIE_SIGN_IDENTITY   force an identity (name or SHA-1) instead of searching
#   AMIE_SIGN_KEYCHAIN   search/sign with this keychain only (CI, tests)
#   AMIE_LOCAL_SIGNING_NAME  CN of the local certificate (setup-signing.sh)

AMIE_LOCAL_SIGNING_NAME="${AMIE_LOCAL_SIGNING_NAME:-Amie Local Signing}"

# Pick the best usable identity. Sets AMIE_IDENTITY_HASH (what codesign gets)
# and AMIE_IDENTITY_NAME (what people read). Returns 1 when there is none.
#
# Order: a distribution certificate, an Xcode development certificate, then
# the local self-signed one. Only identities macOS trusts for code signing are
# considered (`find-identity -v`); codesign cannot use the others anyway.
amie_resolve_signing_identity() {
  AMIE_IDENTITY_HASH=""
  AMIE_IDENTITY_NAME=""
  if [[ -n "${AMIE_SIGN_IDENTITY:-}" ]]; then
    AMIE_IDENTITY_HASH="$AMIE_SIGN_IDENTITY"
    AMIE_IDENTITY_NAME="$AMIE_SIGN_IDENTITY"
    return 0
  fi

  local valid prefix line
  valid="$(security find-identity -v -p codesigning ${AMIE_SIGN_KEYCHAIN:+"$AMIE_SIGN_KEYCHAIN"} 2>/dev/null || true)"
  valid="$(printf '%s\n' "$valid" |
    sed -nE 's/^[[:space:]]*[0-9]+\) ([0-9A-F]{40}) "(.*)".*$/\1 \2/p')"

  for prefix in \
    "Developer ID Application:" \
    "Apple Development:" \
    "Mac Developer:" \
    "$AMIE_LOCAL_SIGNING_NAME"; do
    # Each line is "<40-char hash> <name>"; match the name's start.
    line="$(printf '%s\n' "$valid" |
      awk -v p="$prefix" 'index(substr($0, 42), p) == 1 { print; exit }')"
    if [[ -n "$line" ]]; then
      AMIE_IDENTITY_HASH="${line%% *}"
      AMIE_IDENTITY_NAME="${line#* }"
      return 0
    fi
  done
  return 1
}

# amie_codesign <path> <identifier> [entitlements] — signs with the resolved
# identity, or ad-hoc when AMIE_IDENTITY_HASH is "-".
amie_codesign() {
  local path="$1" identifier="$2" entitlements="${3:-}"
  codesign --force --sign "${AMIE_IDENTITY_HASH:--}" \
    --identifier "$identifier" \
    ${entitlements:+--entitlements "$entitlements"} \
    ${AMIE_SIGN_KEYCHAIN:+--keychain "$AMIE_SIGN_KEYCHAIN"} \
    "$path"
}

# Prints the designated requirement of a signed path (nothing if unsigned).
amie_designated_requirement() {
  codesign -d -r- "$1" 2>&1 | sed -n 's/^#* *designated => //p'
}

# True when the requirement survives a rebuild, i.e. is not cdhash-based.
amie_requirement_is_stable() {
  local requirement
  requirement="$(amie_designated_requirement "$1")"
  [[ -n "$requirement" && "$requirement" != cdhash* ]]
}

AMIE_NO_IDENTITY_HELP="No code-signing identity found. Without one, macOS forgets the
Accessibility permission every time the app is rebuilt. Fix it once with:

    pnpm setup:signing

(It reuses an Xcode \"Apple Development\" or \"Developer ID Application\"
certificate if you have one, and otherwise creates a local one.)"
