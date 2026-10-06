#!/usr/bin/env bash
# One-time: make sure this Mac has a code-signing identity, so the Accessibility
# permission (and the mic / system-audio ones) survive rebuilds.
#
#   pnpm setup:signing
#
# Re-running is safe: it only reports and self-tests when an identity exists.
#
# If you have an Apple Developer account, skip the local certificate: add an
# "Apple Development" (or "Developer ID Application") certificate in Xcode ->
# Settings -> Accounts -> Manage Certificates. It is picked up automatically.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=lib/macos-signing.sh
source "$ROOT/scripts/lib/macos-signing.sh"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "macOS only." >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# macOS's own openssl: Homebrew's OpenSSL 3 writes a .p12 that `security
# import` cannot read ("MAC verification failed").
OPENSSL=/usr/bin/openssl

create_local_identity() {
  local keychain
  keychain="$(security default-keychain | tr -d ' "')"

  cat >"$WORK/cert.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $AMIE_LOCAL_SIGNING_NAME
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF

  "$OPENSSL" req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -config "$WORK/cert.cnf" -keyout "$WORK/key.pem" -out "$WORK/cert.pem" 2>/dev/null

  local password
  password="$("$OPENSSL" rand -hex 16)"
  "$OPENSSL" pkcs12 -export -inkey "$WORK/key.pem" -in "$WORK/cert.pem" \
    -name "$AMIE_LOCAL_SIGNING_NAME" -out "$WORK/id.p12" -passout "pass:$password" \
    -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1

  echo "Importing \"$AMIE_LOCAL_SIGNING_NAME\" into $keychain"
  security import "$WORK/id.p12" -k "$keychain" -P "$password" -T /usr/bin/codesign >/dev/null

  echo
  echo "macOS will now ask for your password to trust this certificate for code"
  echo "signing only (the same step Keychain Access does for a new certificate)."
  security add-trusted-cert -r trustRoot -p codeSign -k "$keychain" "$WORK/cert.pem"
}

# Two different binaries, one identifier: the requirement must be identical
# and must not be a cdhash, or the grant would not survive a rebuild.
self_test() {
  local dir="$WORK/selftest" a b
  mkdir -p "$dir"
  cp /usr/bin/true "$dir/a"
  cp /usr/bin/false "$dir/b"
  amie_codesign "$dir/a" com.pavel.amie.selftest 2>/dev/null
  amie_codesign "$dir/b" com.pavel.amie.selftest 2>/dev/null
  a="$(amie_designated_requirement "$dir/a")"
  b="$(amie_designated_requirement "$dir/b")"
  if [[ -z "$a" || "$a" == cdhash* || "$a" != "$b" ]]; then
    echo "Self-test FAILED: the signature is not stable across builds." >&2
    echo "  build 1: ${a:-<none>}" >&2
    echo "  build 2: ${b:-<none>}" >&2
    return 1
  fi
  echo "Self-test passed. Requirement is the same for different builds:"
  echo "  $a"
}

if ! amie_resolve_signing_identity; then
  create_local_identity
  if ! amie_resolve_signing_identity; then
    cat >&2 <<EOF

The certificate was imported but macOS does not trust it for code signing yet.
Open Keychain Access -> login -> My Certificates -> "$AMIE_LOCAL_SIGNING_NAME" ->
Get Info -> Trust -> Code Signing: Always Trust, then run this again.
EOF
    exit 1
  fi
fi

echo "Signing identity: $AMIE_IDENTITY_NAME"
self_test

cat <<EOF

Next:
  pnpm tauri dev     signs "Amie Dev" (com.pavel.amie.dev) with it on every build
  pnpm tauri build   signs the release "Amie" (com.pavel.amie) with it

The first signature may show "codesign wants to use the key": choose Always Allow.
Then click Allow Accessibility in the app once. It stays on across rebuilds.
EOF
