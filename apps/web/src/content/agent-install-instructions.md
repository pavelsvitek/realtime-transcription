# Install Amie on this Mac

You are an AI agent helping your user install **Amie**, a macOS app that transcribes their meetings live, on their own Mac. Work through the five steps below in order.

**How to work with the user**

- Before each step, tell the user in one or two plain sentences what you are about to do and why it matters. Then do it.
- Some steps need the user to click something in macOS (a permission dialog or a switch in System Settings). You cannot do that for them. Open the right screen, tell them exactly what to click, and wait until they confirm before moving on.
- If a check fails, stop, explain what went wrong in plain words, and don't try workarounds that aren't listed here.
- Don't ask for passwords, and don't use `sudo`.

## About Amie

- **What it does:** Amie writes down every word of a meeting as it's said, from the user's microphone and from the other people on the call. It names who is speaking in Google Meet, Zoom and Microsoft Teams, and writes a summary when the meeting ends.
- **No bot joins the call.** Amie listens on the Mac itself, so nobody in the meeting sees an extra participant.
- **Local by default.** Speech is transcribed on the Mac. Meetings are stored in `~/Library/Application Support/com.pavel.amie/`. Cloud transcription and AI summaries are optional and only use the user's own API key, if they add one in Settings.
- **Works with AI agents.** Amie exposes the user's meetings to Claude, Cursor or any MCP client, and the data stays on the Mac.
- **Requirements:** macOS 15 (Sequoia) or later, on a Mac with Apple silicon (M1 or newer). Intel Macs are not supported.
- **Website:** https://getamie.app · **Help:** https://getamie.app/support · **Email:** support@getamie.app

## Step 1: Check that this Mac can run Amie

**Tell the user:** "First I'll check your macOS version and chip. Amie needs macOS 15 or later and an Apple silicon Mac, so this tells us right away whether it will run here."

Run:

```bash
sw_vers -productVersion
sysctl -n hw.optional.arm64 2>/dev/null || echo 0
```

- The first line must be `15` or higher (for example `15.4` or `26.1`).
- The second line must be `1` (Apple silicon).

If either check fails, stop. Tell the user which requirement isn't met and that Amie can't run on this Mac yet. Don't continue.

Also check whether Amie is already installed:

```bash
ls -d /Applications/Amie.app 2>/dev/null && defaults read /Applications/Amie.app/Contents/Info.plist CFBundleShortVersionString
```

If it is, tell the user the installed version and ask whether to replace it with the latest one. If they say no, skip to Step 3.

## Step 2: Download and install Amie

**Tell the user:** "Next I'll download the latest Amie release from its official GitHub page and copy it into your Applications folder, so you can open it like any other app."

Find the latest installer (a `.dmg` file) and download it:

```bash
DMG_URL=$(curl -fsSL https://api.github.com/repos/pavelsvitek/realtime-transcription/releases/latest \
  | grep -o '"browser_download_url": *"[^"]*_aarch64\.dmg"' \
  | head -1 | cut -d'"' -f4)
echo "$DMG_URL"
curl -fL --progress-bar -o /tmp/Amie.dmg "$DMG_URL"
```

`DMG_URL` must start with `https://github.com/pavelsvitek/realtime-transcription/releases/download/`. If it's empty or points anywhere else, stop and tell the user.

If Amie is running, quit it first: `osascript -e 'quit app "Amie"'`.

Install it:

```bash
MOUNT=$(hdiutil attach -nobrowse -readonly /tmp/Amie.dmg | grep -o '/Volumes/.*$' | head -1)
rm -rf /Applications/Amie.app
ditto "$MOUNT/Amie.app" /Applications/Amie.app
hdiutil detach "$MOUNT" -quiet
rm /tmp/Amie.dmg
xattr -dr com.apple.quarantine /Applications/Amie.app
```

The last line clears the "downloaded from the internet" flag. Without it, macOS may refuse to open Amie in this version.

Confirm it worked: `ls -d /Applications/Amie.app`.

## Step 3: Allow the microphone and system audio

**Tell the user:** "Now Amie needs permission to hear the meeting. The microphone lets it transcribe what you say. System audio lets it transcribe the other people on the call. Without both, half the conversation is missing. macOS only lets you grant these yourself, so I'll open the right screens and tell you what to click."

1. Open Amie once so macOS can ask for the microphone:

   ```bash
   open /Applications/Amie.app
   ```

   Tell the user: "Amie is opening. If macOS asks whether Amie can use the microphone, click **Allow**." Wait for them to confirm.

   If no dialog appeared, or they clicked Don't Allow, open the setting directly:

   ```bash
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
   ```

   Tell the user: "Turn on the switch next to **Amie**."

2. Open the system audio setting:

   ```bash
   open "x-apple.systempreferences:com.apple.preference.security?Privacy_AudioCapture"
   ```

   Tell the user: "In **System Audio Recording Only** (some macOS versions call it **Screen & System Audio Recording**), turn on **Amie**. If Amie isn't in the list, click **+** and choose Amie from Applications." Wait for them to confirm.

## Step 4: Allow Accessibility to see who is speaking

**Tell the user:** "Next is Accessibility. Amie uses it only to read the name of the person speaking in Zoom and Microsoft Teams, so your transcript shows who said what instead of 'Speaker 2'. It's optional. Amie still transcribes without it, but speaker names make transcripts and summaries much more useful. Would you like to turn it on?"

If they say yes:

```bash
open "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
```

Tell the user: "Turn on the switch next to **Amie**. If it isn't listed, click **+** and choose Amie from Applications. macOS may ask for your Mac password or Touch ID. That's normal, so enter it in the macOS dialog, not here." Wait for them to confirm.

If they say no, tell them they can turn it on later from Amie's Settings.

**Google Meet:** Meet speaker names come from the **Amie for Google Meet** browser extension (Chrome or Brave), not from Accessibility. If the user uses Meet, mention that Amie will point them to the extension, and https://getamie.app/support#google-meet has details.

## Step 5: Start Amie

**Tell the user:** "Last step: I'll restart Amie so it picks up the permissions you just granted. macOS only applies system audio and Accessibility access when an app starts."

```bash
osascript -e 'quit app "Amie"' 2>/dev/null; sleep 2
open /Applications/Amie.app
```

Then tell the user:

- On first start, Amie downloads its speech model. This is a one-time download, so it may take a few minutes. No meeting data is sent.
- Amie walks them through a short setup. After that, they can start transcribing from Amie's window when a meeting begins.
- If the other people on a call aren't being transcribed, reopen **System Audio Recording Only** in System Settings, check that Amie is on, then quit and reopen Amie.
- For help: https://getamie.app/support or support@getamie.app.

Finish with a short summary: what you installed (Amie and its version), which permissions are on, and anything the user still needs to do.
