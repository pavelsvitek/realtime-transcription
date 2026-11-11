# Google Meet speaker labels via a browser extension

Architecture plan for a Chromium extension (Chrome and Brave) that reads who is speaking in a live Google Meet tab and streams it to the running Amie app, so remote transcript lines carry a name instead of `Remote`.

Status: **plan, not implemented.** This document builds on the Accessibility design in `docs/technical/meeting-speaker-detection.md`. That file is on branch `claude/google-meet-speaker-id-aaea55` and not yet in `main`. Section 9 explains why this plan revisits its decision D1, which rejected a browser extension.

## 1. Goal and scope

- **Input:** one or more Meet tabs in Chrome or Brave on the same Mac as Amie.
- **Output:** the set of remote participants currently speaking, as display names. It feeds the existing `SpeakerTimeline` on the system-audio sample clock, so `label.rs`, `speaker_cut` and persistence keep working unchanged.
- **Also provided:** the meeting roster (everyone present), the meeting code, and which participant is the local user.
- **Out of scope for v1:** Safari and Firefox, Windows, other web meeting apps (the protocol leaves room for them), captions and transcripts from Meet itself, and any audio or video access.

## 2. What Meet's DOM exposes (measured)

This was measured on 2026-10-20 in Brave on a live call with three devices, all signed in as the same Google account. The probe was read-only and used AppleScript JS execution.

| Signal | Where | Notes |
| --- | --- | --- |
| Participant identity | `[data-participant-id="spaces/<space>/devices/<n>"]` | Present on the video tile and on the People-panel row. It is stable for the device's whole stay in the call. It is per device, so one person joined twice has two ids with the same name. |
| Display name | People-panel row `role="listitem"` `aria-label="<name>"`, or the tile's `span.notranslate` text | `notranslate` is a semantic class (the Google Translate opt-out), not an obfuscated one. The panel row exists only while the People panel is open. |
| Self marker | the People-panel row text contains `(You)` | The text is localized. There is no `data-self-name` attribute. |
| Speaking indicator | `[jsname="QgSmzd"]` inside every tile and every panel row, plus one in the toolbar for your own mic | See below. |
| Mute state | a mic icon in the tile; the attribute `data-is-muted` exists in the page | Not needed for v1. |
| Video SSRC | `data-ssrc` on the tile's video container | Video only. It does not map to the audio streams. |

**How the speaking indicator behaves.** This is the core finding. The `QgSmzd` element is Meet's three-bar level meter.

- **When silent,** its class list is static and holds one idle token (`gjg47c` in this deploy).
- **While the participant talks,** it cycles every ~100 ms through level tokens (`HX2H7`, `OgVli`, `Oaajhc`, `wEsLMd`).
- **The self tile** also gets a sticky token (`sxlEM`) for the length of the speech burst.
- **Measurement:** over 20 s, the speaking participant's tile meter and panel-row meter changed in lockstep, about 60 changes each. The muted participant's meter never changed.

The token names are obfuscated and will change with Meet deploys. The *behaviour* (a meter that is static when quiet and flickers when loud) is what the detector relies on.

**Not yet measured.** Phase 0 must answer these:

1. Does the meter keep updating when the Meet tab is in the background, the window is minimized, or the window is on another Space? Chromium throttles `requestAnimationFrame` in hidden tabs. The Accessibility approach already loses Meet in hidden tabs.
2. Large calls: participants outside the visible grid have no tile. Do they still get a meter, through the People panel, Meet's own "show active speaker" swap, or not at all?
3. Presentation mode, spotlight and pin layouts, and Meet's auto picture-in-picture window. The PiP window is a separate document; can a content script reach it?
4. How far the meter lags the same audio as heard in Amie's system-audio capture.
5. Whether `jsname="QgSmzd"` survives Meet deploys. jsnames are template ids and usually change less often than CSS classes, but that is not guaranteed.

## 3. Architecture overview

```text
 Brave / Chrome                                            Amie (Tauri, Rust)
┌──────────────────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ meet.google.com tab                          │        │ speakers::bridge                         │
│ ┌──────────────────────────────────────────┐ │        │  server.rs   127.0.0.1 WebSocket         │
│ │ content script (isolated world)          │ │        │              Origin = extension id check │
│ │  roster: data-participant-id → name/self │ │        │  protocol.rs serde types, version check  │
│ │  detector: meter flicker → speaking set  │ │        │  registry.rs tabs, meetings, freshness   │
│ └──────────────┬───────────────────────────┘ │        │       │                                  │
│   chrome.runtime port (per tab)              │        │       ▼ BrowserSpeakers (latest per tab) │
│ ┌──────────────▼───────────────────────────┐ │  WS    │ speakers::watch / source arbitration     │
│ │ service worker                           │─┼───────▶│  extension > Accessibility > nothing     │
│ │  one socket to Amie, multiplexes tabs,   │ │ JSON   │       │                                  │
│ │  reconnect + backoff, keepalive          │ │        │       ▼ SpeakerHold → SpeakerTimeline     │
│ └──────────────────────────────────────────┘ │        │         (system-audio sample clock)      │
│ popup: connection + live speakers (debug)    │        │       → label.rs, speaker_cut (unchanged)│
└──────────────────────────────────────────────┘        └──────────────────────────────────────────┘
```

Responsibilities are split along the same line as D2 in the Accessibility design:

- **Content script:** owns all Meet-specific knowledge. It turns DOM into `{participants, speaking}` and nothing else.
- **Service worker:** transport only. It knows no Meet details.
- **Amie bridge:** network, protocol and clock mapping. It knows no Meet DOM details.
- **The existing speakers core** (`timeline.rs`, `label.rs`, the cut path) is reused as-is.

## 4. Extension design

### 4.1 Package

- **Location:** a new workspace app `apps/meet-extension` (already covered by `pnpm-workspace.yaml` `apps/*`).
- **Tooling:** TypeScript (strict, as in `apps/amie`), built with Vite or esbuild to `dist/`. Tests use vitest plus jsdom.
- **Manifest V3,** minimal permissions:

```jsonc
{
  "manifest_version": 3,
  "name": "Amie for Google Meet",
  "key": "<public key>",                 // pins the extension id for unpacked dev builds too
  "background": { "service_worker": "sw.js", "type": "module" },
  "content_scripts": [{
    "matches": ["https://meet.google.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle",
    "all_frames": false
  }],
  "host_permissions": ["http://127.0.0.1/*"],   // localhost bridge; see 6.3 on Local Network Access
  "permissions": ["storage"],                   // remembers port/pairing state
  "action": { "default_popup": "popup.html" }
}
```

- **No other permissions:** no `tabs`, `scripting`, `webRequest`, `debugger`, or `<all_urls>`. The Web Store listing can then say "reads speaker names on meet.google.com and sends them only to the Amie app on this computer".
- **Brave:** runs the same build. Brave installs from the Chrome Web Store and supports MV3 service workers.

### 4.2 Content script modules

```text
content/
  index.ts        wiring: start/stop on call join/leave, port to the service worker
  call.ts         in-call detection (participant tiles present + /xxx-xxxx-xxx path), meeting code
  roster.ts       participant id → { name, isSelf }, rebuilt on DOM changes (debounced)
  detector.ts     pure: meter mutations + clock → speaking ids (no DOM access, unit-tested)
  meters.ts       finds meter elements per participant; MutationObserver feeding detector.ts
  selectors.ts    the few DOM hooks, as data that Amie can override (see 4.5)
```

**In-call detection.**
- The tab is "in call" when the URL path is a room code and at least one `[data-participant-id]` tile exists.
- It "leaves" when the tiles disappear for more than 5 s (the end-call screen) or the tab unloads (`pagehide`).
- The green room, before joining, has no participant tiles and sends nothing.

**Roster.**
- The key is `data-participant-id`, never the name: this test call had three devices named "Pavel Svitek".
- Name resolution order:
  1. the panel row's `aria-label`
  2. the tile's `span.notranslate` text
  3. the last known name
- Duplicate names among *remote* participants are passed through unchanged; Amie decides how to show them (section 5.4).

**Self detection.** The self flag is used in this order:
1. **Correlation.** The toolbar mic meter (the one `QgSmzd` not inside any participant element) flickers in lockstep with the self tile's meter, which was measured as identical timestamps. The participant whose meter changes coincide with the toolbar meter in more than 90% of changes over the first speech is self. This works in any UI language.
2. **The `(You)` suffix** in the People panel, for English and when the panel is open.
3. **Unknown.** Amie then falls back to its existing rule: the name equals the macOS full name.

### 4.3 Speaking detector

The detector is a pure function over meter events, so recorded traces can be replayed in tests (the same idea as D2 and D9 of the Accessibility design). It matches no class name; it uses only "did this meter's class list change, and is it in its idle state".

```ts
type MeterEvent = { participantId: string; at: number; tokens: string };  // class list, sorted
interface Detector {
  onMeter(e: MeterEvent): void;
  speaking(now: number): Set<string>;   // participant ids
}
```

Per meter, the detector keeps `lastChangeAt`, `tokens` and `idleTokens`:

- **Learn idle:** a token set held unchanged for at least `IDLE_LEARN_MS = 1500` becomes that meter's `idleTokens`. A meter that is talking never holds still that long (measured runs of 100-500 ms).
- **Active:** `now - lastChangeAt <= CHANGE_WINDOW_MS (300)`, or `idleTokens` is known and `tokens != idleTokens`. The second rule covers a level held for 500 ms and the sticky self token.
- **No cold start.** A participant already talking when the script loads is caught by the change rule on the first flicker, unlike the Accessibility tracker's minimum-baseline approach.
- **Noise floor:** turning on needs at least `MIN_ON_CHANGES = 2` changes within `CHANGE_WINDOW_MS`, so a single blip from background noise does not mark a speaker.
- **Hangover:** a participant stays speaking for `HANGOVER_MS = 500` after going inactive, so word gaps do not split the set. Amie's `SpeakerHold` adds its own hold downstream; keep both short so the pair stays well under a sentence.
- **Merge:** a participant is speaking if *any* of their meters (tile, panel row) is active.

**Cost.** One `MutationObserver` on `document.body` with `attributeFilter: ["class"]` and `subtree: true`.
- The callback first checks `target.matches(meterSelector)` and drops everything else.
- Meet changes many classes, about 2,300 mutations per 15 s in this call, mostly tile `style` resizes that the filter already excludes. The match test is constant-time, so the overhead is negligible.
- Roster rebuilds are debounced to 250 ms on `childList` changes.

### 4.4 Messages to the service worker

- Each Meet tab opens one `chrome.runtime.connect({ name: "meet" })` port.
- The content script sends a message **when the speaking set changes** (edge-triggered, low latency).
- It also sends a **1 s heartbeat** with the full current state. The heartbeat lets Amie detect a stale tab and lets a reconnecting Amie resync without waiting for a change.
- Timestamps are `performance.timeOrigin + performance.now()` (wall-clock ms, sub-ms precision). The content script and Amie share the machine clock.

### 4.5 Selectors as data, plus self-healing

`selectors.ts` holds the only DOM hooks:

```ts
export const DEFAULT_SELECTORS = {
  participant: "[data-participant-id]",
  meter: '[jsname="QgSmzd"]',
  name: "span.notranslate",
  panelRow: '[data-participant-id][role="listitem"]',
};
```

- **Override from Amie:** Amie may send an override in its `welcome` message. If Meet ships a new jsname, an Amie update (or a small JSON fetched with Amie's existing updater feed) fixes it without a Web Store review cycle.
- **Discovery fallback,** in line with D4's "relative signal" rule:
  - **Trigger:** participant tiles exist for 30 s but the meter selector matches nothing.
  - **Search:** the content script watches class mutations *inside* participant elements and picks, per tile, the small descendant (under 48 px) whose class list flips at least 5 times in 2 s while cycling through at most 8 distinct token sets.
  - **Report:** it then sends `health: degraded, reason: "meter-discovered"` so the drift shows up in logs.
- **Health:** tiles present for 60 s, meters found, and no meter ever changed while Amie reports system-audio sound. Amie can see this condition, so Amie raises the warning (section 5.5).

### 4.6 Service worker

- **One socket:** it keeps a single WebSocket to Amie, multiplexing all Meet tabs with a key `tabKey = <instanceId>:<tabId>`. `instanceId` is a random id stored in `chrome.storage.local` per browser profile.
- **Connect:**
  - It connects only while at least one Meet port is open. It holds no idle connection, so Amie is not touched when no call is running.
  - Ports are `ws://127.0.0.1:47821..47825`: try the last good port first, then the range.
  - Backoff after failure is 1 s, 2 s, 5 s, up to 10 s.
- **Keepalive:** an MV3 service worker stays alive while its WebSocket has traffic (Chrome 116+). The 1 s heartbeats provide that. Port messages from content scripts also reset the idle timer.
- **Browser identification:** `navigator.brave?.isBrave()` → `brave`, otherwise `chrome` (also covers Edge, Arc and others, which can be told apart later via `navigator.userAgentData.brands`).
- **Popup (debug and support):** shows connected or not, Amie's version, the tabs in a call, and the live speaking names. It is cheap to build and it is the primary Phase 1 deliverable.

## 5. Amie design

### 5.1 Module layout

The new code sits beside the existing readers and follows `src-tauri/ARCHITECTURE.md` (domain code takes callbacks, not `AppHandle`; `commands/` stays thin; `ipc/` is serde only):

```text
speakers/
  bridge/
    mod.rs        BrowserBridge facade: start(), snapshot(), attach_session(), detach_session()
    server.rs     tokio TcpListener on 127.0.0.1, tokio-tungstenite accept_hdr_async, Origin check
    protocol.rs   serde message enums (versioned), shared shapes with the extension (see 7)
    registry.rs   per-connection and per-tab state, freshness, meeting dedupe, selection
    clock.rs      wall-clock → sample-clock mapping
```

Dependencies are already present: `tokio` (with `net`), `tokio-tungstenite 0.26` (today client-only for xAI; the server side needs no new crate), `futures-util`, `serde_json`. No axum or hyper.

**Lifetime:**
- The bridge starts at app launch, on `tauri::async_runtime`, so the extension shows "connected" before a recording starts. Users check this before a call.
- It is cheap when idle: one listening socket.

### 5.2 Getting labels into the timeline

Today `watch.rs` polls `meeting::read_speakers()` every 250 ms and pushes to the timeline stamped with `captured_counter`. The extension is push-based and more precise, so it should not wait for a poll.

1. **Extract** the "record a speaker set" step from `watch.rs` (SpeakerHold → `timeline.push(at_ms, set)` → bump `speaker_cut` on a non-empty change) into one function, `record(set, at_ms)`, behind a small `SpeakerSink` that `TranscriptionService::start_internal` builds next to the timeline (service.rs:203-285).
2. **Attach:** at session start, the service calls `bridge.attach_session(sink)`. At stop it calls `detach_session()`. With no session attached the bridge only keeps state, for the status UI.
3. **Push:** when a speakers event arrives for the *selected* tab (5.4), the bridge maps its time (5.3), removes self ids, maps ids to names, and calls `sink.record(names, at_ms)`.
4. **Arbitration with the poller:** while the bridge reports a **live** Meet source, the watch thread skips the Meet Accessibility read (and its ~1 s browser tree walk). Live means connected, tab in a call, and a heartbeat less than 2.5 s old. Zoom and Teams keep their current priority: a native meeting app with a speaker wins, as in today's dispatcher.
   - **Single writer:** only one source writes to the timeline at a time. The arbiter is the watch thread, which asks `bridge.is_live()` each poll; the bridge writes only while it holds the "active source" flag.
5. **Fallback:** if heartbeats stop (extension disabled, tab closed, browser crash), the bridge drops `live` after 2.5 s. The Accessibility reader takes over on the next poll. `SpeakerHold` covers the gap.

This keeps D3's output contract: a set of remote display names, an empty set meaning nobody is speaking, and self excluded.

### 5.3 Clock mapping

The timeline is in system-audio sample ms. The extension stamps wall-clock ms.

```text
at_ms = samples_to_ms(captured_counter_now) - (wall_now_ms - observed_at_ms) - MEET_METER_LEAD_MS
```

- **Transport lag** (`wall_now - observed_at`) is measured per event. It is usually under 5 ms on loopback and is clamped to `[0, 2000]`.
- **`MEET_METER_LEAD_MS`** is the offset between Meet's meter and the same audio reaching Amie's capture.
  - **Positive** if the meter fires before the audio is heard. That is plausible: Meet may compute levels on decode, before the playout buffer.
  - It is measured in Phase 0 and kept as a named constant with the measurement in a comment (D6).
- **Sample clock as the base.** It is `captured_counter`, the same counter `watch.rs` uses, so a stalled capture cannot shift labels. A segment's `start_ms`/`end_ms` and the speaker change share one clock.

### 5.4 Choosing among tabs, browsers and meetings

The registry holds every tab that is in a call. Selection rule:

1. **Same meeting code in several tabs or browsers.** One meeting open in both Brave and Chrome, as in this test setup, is merged: the union of speaking *names*. Each tab's own self is removed first, and the other device's self is then removed by comparing names with every tab's self name.
2. **Different meeting codes.** Prefer the tab whose speaking set changed most recently. A second meeting left open idle never takes over.
3. **Ties:** keep the current selection (hysteresis), so labels do not flap.

Display names:
- **Two remote participants with the same name:** Amie shows `Name` for both in v1 (this matches what Meet shows). This is noted as a limit. A later change can keep the participant id in the timeline and suffix `(2)`.
- **Roster:** it is also exposed as `present` for the `MeetingSource` `SpeakerRead`, if the registry from the Accessibility design (section 6) lands. It also seeds meeting participants for summaries and MCP.

### 5.5 Status, settings and onboarding

- **`get_speaker_tags_status`** (and `SystemAccessStatus`) gains `browser_extension: { connected: bool, browsers: ["brave","chrome"], in_call_tabs: n, extension_version, health }`.
- **Settings → System access:** a row reading "Google Meet browser extension: Connected (Brave)" or "Not detected", with an install link. Accessibility stays the fallback and stays listed.
- **Onboarding:** an optional step, "Using Google Meet in Chrome or Brave? Install the Amie extension for speaker names." It is skippable; the Accessibility step stays.
- **Health warning:**
  - **Trigger:** the bridge is live, the roster is non-empty, system audio has sound for 60 s, and no speaker is ever reported.
  - **Effect:** Amie logs `meet-extension: no speaking signal`, tells the frontend (the same channel as the silence banners), and falls back to the Accessibility reader for the rest of the session.
- **Frontend:** `MeetingApp` gets `"google-meet"` (as on the Meet branch), plus a `source: "extension" | "accessibility"` field so the UI and logs can say which path produced the names.

## 6. Transport and security

### 6.1 Why a localhost WebSocket

| Option | Pros | Cons | Verdict |
| --- | --- | --- | --- |
| **WebSocket on 127.0.0.1** (chosen) | One process, no extra binary; bidirectional and push; works the same in Chrome and Brave; easy to test with any WS client | Any local process or web page can try to connect, so it needs an Origin check and must not trust the content; port conflicts are possible | v1 |
| Native Messaging | The browser checks the caller (`allowed_origins` by extension id); no open port | Needs a separate host binary that the browser spawns per connection, which then relays to Amie (two hops, so a socket anyway); needs a host manifest per browser and profile dir (`~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`, `…/BraveSoftware/Brave-Browser/NativeMessagingHosts/`, Canary, Edge, …); the installer has to write them | Later hardening if needed |
| Chrome DevTools Protocol | Full DOM | Needs the browser relaunched with `--remote-debugging-port`, which ends the live call; it is a large attack surface | Rejected (same as D1) |
| HTTP POST per event | Simple | More overhead per event, no server → extension channel for selectors and health | Rejected |

### 6.2 Server hardening

- **Bind address:** `127.0.0.1` only, never `0.0.0.0`.
- **Port range:** a fixed small range, `47821-47825`. The first free port is used and written to the log and status.
- **Origin check in the upgrade handshake:**
  - Accept only `Origin: chrome-extension://<AMIE_EXTENSION_ID>`, plus the dev id in debug builds.
  - Browsers set `Origin` on WebSocket upgrades and pages cannot forge it, so ordinary websites (including `meet.google.com` itself) are refused.
  - A local native process can forge it. That is accepted: such a process can already read the screen and the Accessibility tree, and the worst it can do here is inject wrong speaker names.
- **Message checks:** at most 64 KB per message; names longer than 256 chars or more than 500 participants are dropped. A `protocol` major-version mismatch is closed with a clear reason that the extension popup shows.
- **No secrets:** nothing comes back to the extension but `welcome`, selector overrides and acks. Amie never sends transcript content to the browser.

### 6.3 Things to verify in Phase 0

- **Chrome's Local Network Access restrictions** (prompts for public pages reaching `localhost`): confirm an extension service worker with `host_permissions: ["http://127.0.0.1/*"]` is exempt in current Chrome and Brave.
- **Brave:** Shields and its own localhost-access permission apply to sites. Confirm they do not block the service worker.
- **MV3 service worker lifetime:** it must survive a 60-minute call with the 1 s heartbeat, including a laptop sleep and wake (it reconnects).

## 7. Wire protocol (v1)

JSON text frames. Every message has `type`. Extension-to-app messages carry `tab` (tabKey) where relevant.

```jsonc
// extension → Amie, first frame
{ "type": "hello", "protocol": 1, "extension_version": "0.1.0",
  "browser": "brave", "instance_id": "b1f…" }

// Amie → extension
{ "type": "welcome", "protocol": 1, "app_version": "0.1.2",
  "recording": true,                       // informational; the popup shows it
  "selectors": null }                      // or an override object (4.5)

// call lifecycle
{ "type": "call", "tab": "b1f…:812", "state": "joined",
  "meeting_code": "xfc-vvyo-cwt", "observed_at": 1792500000123.4 }
{ "type": "call", "tab": "b1f…:812", "state": "left", "observed_at": … }

// roster, sent on change (debounced)
{ "type": "roster", "tab": "b1f…:812",
  "participants": [ { "id": "spaces/P0rOpVvN1A8B/devices/96", "name": "Ada Lovelace", "self": false },
                    { "id": "spaces/P0rOpVvN1A8B/devices/95", "name": "Pavel Svitek", "self": true } ] }

// speaking set, edge-triggered; seq is monotonic per tab
{ "type": "speakers", "tab": "b1f…:812", "seq": 42, "observed_at": 1792500001456.7,
  "speaking": ["spaces/P0rOpVvN1A8B/devices/96"] }

// every 1 s per in-call tab: full state for resync plus freshness
{ "type": "heartbeat", "tab": "b1f…:812", "seq": 43, "observed_at": …,
  "speaking": [...], "visibility": "visible",
  "health": { "meters": 4, "last_meter_change_ms_ago": 180, "selectors": "default" } }

{ "type": "health", "tab": "b1f…:812", "status": "degraded", "reason": "meter-discovered" }
```

- **Ids, not names, in `speakers`:** the roster resolves them. A rename or a late-arriving name then never splits a speaking interval.
- **Ordering:** Amie ignores a `speakers` frame whose `seq` is not greater than the last seen for that tab.
- **Shared types:** they live in `apps/meet-extension/src/protocol.ts` and `speakers/bridge/protocol.rs`. A JSON fixture file of example frames is parsed by both test suites, so the two definitions cannot drift.

## 8. Testing

Following D9 of the Accessibility design (verifiable without a real call):

- **Trace recorder.** A dev-only toggle in the popup records meter events (`{t, participantId, tokens}`) and roster snapshots to a downloadable JSON file. Traces like the one measured for section 2 become fixtures.
  - Names are anonymized to `P1`, `P2` before they are committed.
- **Detector unit tests** (vitest) replay the traces: one speaker, a hand-off, overlap, a muted participant, noise blips, cold start mid-speech, and a meter token rename (a fixture with every token rewritten, which must give an identical result).
- **DOM tests** (vitest + jsdom): roster and self detection, run against sanitized HTML snapshots of a tile and a panel row.
- **Fake Meet page** (`apps/meet-extension/fake-meet/`): a static page that copies the tile and meter structure and flickers meters on a script. The dev build adds `http://localhost/*` to `matches`.
  - It drives the extension → Amie path end to end, in the same role `apps/fake-zoom-app` plays for Zoom.
  - Paired with TTS audio, it also measures `MEET_METER_LEAD_MS` against a known schedule. The real lead still needs a real call.
- **Rust:** protocol fixture parsing, Origin rejection, seq ordering, clock mapping, registry selection and merge rules, and an integration test where a `tokio-tungstenite` client feeds frames and the test asserts the timeline contents.
- **Live check:** a Meet call with two devices, such as the Brave plus Chrome setup used for section 2. Compare the extension's speaking intervals with the transcript.

## 9. Revisiting D1 (Accessibility over an extension)

D1 rejected an extension because it "requires installing something in the browser". That cost is real but one-time, and it does not need a browser restart or interrupt a call. The extension fixes the Meet limits listed in section 7 of the Accessibility design:

| Limit in the Accessibility design | With the extension |
| --- | --- |
| Cold start (1-3 s missed) | No baseline needed; a speaker is detected on the first meter flicker |
| Self tile identified by macOS full name only | The DOM marks self (meter correlation, `(You)`) |
| Hidden tab drops out of the tree | **Unknown**, Phase 0 question 1; may be no better |
| ~1 s browser tree read per poll | Event-driven, ~100 ms after the meter changes |
| Sets `AXManualAccessibility` on the whole browser (D8) | Not needed when the extension is live |
| Heuristic on node and token counts | Reads Meet's own level meter |

**Proposal:** keep Accessibility as the zero-install fallback, and amend D1 so the extension is preferred when present. This document should be linked from that one once both are in `main`.

## 10. Delivery plan

| Phase | Deliverable | Done when |
| --- | --- | --- |
| **0. Spike** (1-2 days) | Throwaway content script plus a tiny Rust WS echo server | Section 2's five questions and section 6.3's three are answered with measurements and written into this document, including `MEET_METER_LEAD_MS` |
| **1. Extension, standalone** | `apps/meet-extension`: call detection, roster, detector, popup with live speakers, trace recorder, unit tests | Live speakers show correctly in the popup on a real call in Brave and Chrome |
| **2. Amie bridge** | `speakers/bridge` server, protocol, registry, status in `get_speaker_tags_status`; extension service worker connection | Settings shows "Connected (Brave)", and `heartbeat`s arrive in the logs |
| **3. Timeline wiring** | `SpeakerSink` extraction from `watch.rs`, attach and detach in `service.rs`, arbitration with the Accessibility reader, clock mapping, self removal, multi-tab rules | A recorded Meet session has named remote lines; the Rust integration test passes |
| **4. Productize** | Settings row, onboarding step, health warning and fallback, Web Store listing (unlisted first), privacy text, `docs/README.md` entry | Installed from the Web Store in Brave and Chrome; works with Amie release `com.pavel.amie` |
| **5. Hardening** (as needed) | Selector override delivery, Native Messaging option, duplicate-name suffixes, other web apps (Zoom web, Teams web) behind the same protocol | Driven by Phase 4 feedback |

**Dependency:** phases 3-4 should build on the Meet Accessibility branch (`claude/google-meet-speaker-id-aaea55`). That branch has `MeetingApp::GoogleMeet`, browser discovery and the fallback this plan relies on. Merge or rebase it first, or land the `MeetingSource` registry (section 6 of the Accessibility design) so the extension becomes one more source rather than a special case.

## 11. Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Meet renames `jsname="QgSmzd"` | Medium, over months | Selector override from Amie, discovery fallback (4.5), health warning plus Accessibility fallback |
| Meet stops updating meters in background tabs | Unknown | Phase 0; if so, document "keep Meet visible or use Meet's PiP", the same as today |
| Meet removes the per-tile level meter | Low | Accessibility fallback; a WebRTC `getSynchronizationSources()` audio-level hook in the page's main world is a possible v2, but mapping its CSRCs to participants is unsolved |
| Local Network Access or Brave blocks localhost from the extension | Low-medium | Phase 0; Native Messaging is the fallback transport |
| Web Store review delays a fix | Medium | Selector overrides ship with Amie, not the extension |
| A wrong label when a remote attendee is also the user on a second device | Low (dev setups) | Self-name removal across tabs (5.4) |
