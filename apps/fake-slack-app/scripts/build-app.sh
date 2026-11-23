#!/usr/bin/env bash
# Builds build/FakeSlack.app.
#
# The bundle id is Slack's own, com.tinyspeck.slackmacgap: Amie finds Slack by
# that id, so the fake has to carry it. (The app refuses to start while real
# Slack runs, except for --print-ax / --snapshot self-inspection runs.)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/build/FakeSlack.app"
BUNDLE_ID="com.tinyspeck.slackmacgap"

swift build --quiet -c release --package-path "$ROOT" --product FakeSlack
BIN="$(swift build -c release --package-path "$ROOT" --show-bin-path)/FakeSlack"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

PLIST="$(mktemp)"
trap 'rm -f "$PLIST"' EXIT
cat >"$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleExecutable</key>
	<string>fake-slack</string>
	<key>CFBundleIdentifier</key>
	<string>$BUNDLE_ID</string>
	<key>CFBundleName</key>
	<string>Fake Slack</string>
	<key>CFBundleDisplayName</key>
	<string>Fake Slack</string>
	<key>CFBundlePackageType</key>
	<string>APPL</string>
	<key>CFBundleShortVersionString</key>
	<string>0.1.0</string>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>15.0</string>
	<key>NSHighResolutionCapable</key>
	<true/>
	<key>NSPrincipalClass</key>
	<string>NSApplication</string>
</dict>
</plist>
PLIST_EOF

# Re-sign only when something changed. The app is only ever read, never
# granted anything, so an ad-hoc signature is all macOS needs to run it.
changed=0
if ! cmp -s "$PLIST" "$APP/Contents/Info.plist"; then
  cp "$PLIST" "$APP/Contents/Info.plist"
  changed=1
fi
if ! cmp -s "$BIN" "$APP/Contents/MacOS/fake-slack"; then
  cp "$BIN" "$APP/Contents/MacOS/fake-slack"
  chmod +x "$APP/Contents/MacOS/fake-slack"
  changed=1
fi
if [[ "$changed" -eq 1 || ! -e "$APP/Contents/_CodeSignature" ]]; then
  codesign --force --sign - "$APP" >/dev/null 2>&1
fi
echo "Built $APP" >&2
