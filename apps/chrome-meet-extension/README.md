# Amie for Google Meet

Google Meet extension speaker-tracking for Amie. The unpacked extension reads who is speaking from Google Meet’s own level meters and sends those remote display names to Amie Dev over a loopback WebSocket (`speakers::meet_bridge`). It is not a Zoom or Teams integration and it is not a generic browser bridge.

Amie listens only in DEV (`debug_assertions` or bundle id `com.pavel.amie.dev`) on `127.0.0.1`, ports `47821–47825`. The extension opens that socket only while a Google Meet call is in progress. A lobby tab stays disconnected.

## Load unpacked

1. Start Amie Dev: `pnpm -F amie tauri` (or `pnpm dev:desktop`).
2. Confirm the log line `meet_bridge listening on ws://127.0.0.1:4782x (Google Meet extension)`.
3. Build the extension: `pnpm -F chrome-meet-extension build`.
4. Chrome or Brave → `chrome://extensions` → Developer mode → Load unpacked → select `apps/chrome-meet-extension/dist`.
5. The extension name is **Amie for Google Meet**. DEV accepts any `chrome-extension://` origin, so no extension id pin is required.
6. Join a Google Meet call (the green room is not enough). Open the extension popup: it should say **Connected**, with the Amie version.
7. When someone else talks, the popup shows their display name. Your own tile is not listed as a remote speaker.
8. Leave the call or sit in the lobby: the popup returns to **Not connected**.

Optional fake call (no Google account). This needs the DEV build (`pnpm -F chrome-meet-extension build`, not `--store`).

```bash
pnpm -F chrome-meet-extension fake-meet
```

1. Load unpacked `apps/chrome-meet-extension/dist`, then reload the fake tab if it was already open.
2. Open `http://127.0.0.1:47921/abc-defg-hij` (the server redirects `/` there). A lobby path has no meeting code, so the extension stays disconnected.
3. With Amie Dev running, the popup says **Connected**.
4. Click **Ada talks** in the DEV strip. Ada’s tile gets a green speaking border and the popup says **Speaking: Ada Lovelace**.
5. Click **Sam talks** for a second remote. Sam Rivera is not self; the popup lists **Sam Rivera** (and Ada too if both remotes are talking). Amie Remote/system-audio labels use the same names.
6. Click **Pavel talks** to flicker the self tile (and toolbar mic meter) with the same level classes. The popup shows **You are speaking (Pavel Svitek)**; Pavel stays off the remote **Speaking:** list. All three toggles work independently — remotes stay on **Speaking:** if they are also talking. Self ids stay in the `speakers` / `heartbeat` wire frames — Amie only strips them when labeling remote transcript lines.

## What Amie does with the names

While a meeting is recording, a live Meet extension feed is the speaker source. Zoom and Teams keep using Accessibility. Google Meet has no Accessibility fallback: if the extension disconnects, remote Meet lines go back to unnamed within about 2.5 seconds.

`MEET_METER_LEAD_MS` is `0` until a live call measures how far the meter leads system audio.

## Chrome Web Store package

Production / Store builds omit the fake-Meet `localhost` / `127.0.0.1` **content-script** matches. (`host_permissions` still includes `http://127.0.0.1/*` so the service worker can open `meet_bridge`.) Version is `package.json` `version` in this package; `build:prod` copies it into `dist/manifest.json`. The service worker hello frame uses `chrome.runtime.getManifest().version` so it stays in lockstep.

```bash
pnpm -F chrome-meet-extension pack:prod
```

That writes a gitignored zip at:

`apps/chrome-meet-extension/release/amie-for-google-meet-v<version>.zip`

Example for `0.1.0`: `apps/chrome-meet-extension/release/amie-for-google-meet-v0.1.0.zip`.

`manifest.json` is at the zip root (not nested under `dist/`). Upload that file in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (Package → Upload new package). Bump `version` in this `package.json` before packing a new Store upload.

Related scripts:

- `pnpm -F chrome-meet-extension build` — DEV `dist/` (includes localhost matches for fake Meet)
- `pnpm -F chrome-meet-extension build:prod` — Store `dist/` only (`--store`)
- `pnpm -F chrome-meet-extension pack` — same as `pack:prod`
