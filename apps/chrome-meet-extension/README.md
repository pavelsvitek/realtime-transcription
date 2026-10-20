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

Optional fake call (no Google account):

```bash
pnpm -F chrome-meet-extension fake-meet
```

Open `http://127.0.0.1:47921/abc-defg-hij` and click **Ada talks**. The DEV build injects on `localhost` and `127.0.0.1` so this page can exercise the same path.

## What Amie does with the names

While a meeting is recording, a live Meet extension feed is the speaker source. Zoom and Teams keep using Accessibility. Google Meet has no Accessibility fallback: if the extension disconnects, remote Meet lines go back to unnamed within about 2.5 seconds.

`MEET_METER_LEAD_MS` is `0` until a live call measures how far the meter leads system audio.
