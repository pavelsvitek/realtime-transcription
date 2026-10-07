# Meeting speaker detection

How Amie learns **who is speaking** on a call so remote transcript lines carry a name instead of "Remote". This document records how it works today for Zoom, Microsoft Teams and Google Meet, what was measured on a real Meet call, the decisions behind the design, and the module structure to grow it to more apps.

Code lives in [`apps/amie/src-tauri/src/speakers/`](../../apps/amie/src-tauri/src/speakers/). Status: Zoom and Teams are in `main`; Google Meet is implemented on branch `claude/google-meet-speaker-id-aaea55` and verified against two recorded calls, but not yet run end to end inside a transcription session.

## 1. The problem

Amie captures two audio streams ([macos-capturing-audio.md](./macos-capturing-audio.md)): the microphone (the user, always labelled `User`) and system audio (everyone else, labelled `Remote`). The speech model cannot tell remote people apart, and single-channel diarization is weak on overlapping speech.

The meeting app already knows who is talking, because it highlights that person's tile. Amie reads that signal through macOS Accessibility and stamps it on the audio clock. No call API, browser extension or account access is needed.

## 2. End-to-end flow

```text
 meeting app window                      Amie
 ┌────────────────────┐   AX tree   ┌──────────────────────────────────────────┐
 │ tiles, names,      │ ──────────▶ │ speakers::watch   (thread, 250 ms poll)  │
 │ speaking marks     │             │   meeting::read_speakers() -> {names}    │
 └────────────────────┘             │   SpeakerHold    (bridge short gaps)     │
                                    │   SpeakerTimeline.push(audio_ms, names)  │
 system audio (Remote) ───────────▶ │ label::speaker_for_segment(start, end)   │
                                    └──────────────────────────────────────────┘
                                                   │
                                      "Ada Lovelace" / "Ada; Bob" / "Remote"
```

- **Poll:** [`watch.rs`](../../apps/amie/src-tauri/src/speakers/watch.rs) calls `meeting::read_speakers()` every 250 ms while a session records.
- **Hold:** `SpeakerHold` keeps the last speaker for 4 empty polls so one failed read does not cut a sentence. It publishes nothing before the first speaker is seen, because call start often has an empty tree.
- **Timeline:** [`timeline.rs`](../../apps/amie/src-tauri/src/speakers/timeline.rs) stores each distinct set against the *captured-sample clock*, not wall time, so it lines up with the audio even when polls are late. Identical consecutive sets collapse.
- **Resolve:** for a transcript segment's time range, the set covering the most of it wins. Simultaneous names are joined with `"; "` in sorted order, so a comma inside a name is not a separator.
- **Relabel:** [`label.rs`](../../apps/amie/src-tauri/src/speakers/label.rs) only touches the system stream. Microphone lines keep their own label.
- **Cut:** when a new, non-empty set appears, `speaker_cut` is bumped so the pipeline can end the current segment at the speaker change.

Everything after `read_speakers()` is independent of which meeting app produced the names. That boundary is the seam the modular design below relies on.

## 3. Module map

| Module | Role | Knows about |
| --- | --- | --- |
| `watch.rs`, `timeline.rs`, `label.rs` | poll loop, audio-clock timeline, segment relabelling | nothing app-specific |
| `meeting.rs` | picks the running app, dispatches a read | Zoom, Teams, Meet (hard-coded) |
| `meeting/process.rs` | finds a process by bundle id or path | bundle ids |
| `meeting/ax.rs` | the only code that calls `AXUIElement`; snapshots a tree into `AxNode` | macOS |
| `tree.rs` | `AxNode` snapshot type, `dump()`, helpers | nothing |
| `parse.rs` | `parse_tile_label`: `"Ada, speaking"`, `"Pavel (You)"` -> name, speaking, self | label text |
| `zoom.rs`, `teams.rs`, `meet.rs` | **pure** `AxNode -> speaking names` readers | one app each |
| `permission.rs`, `identity.rs`, `status.rs` | Accessibility trust, which Amie build is running, UI status | macOS TCC |
| `print_ax.rs` | `--print-ax` debugging mode (see section 8) | nothing |

The important property already in place: **only `ax.rs` touches the OS**. The app readers receive a plain `AxNode` tree, so they are unit-tested with hand-built trees and with no Accessibility permission.

## 4. Per-app findings

### Zoom (native)

Tiles are `AXMenuItem` nodes whose accessible name ends in `, speaking` / `, not speaking`. The participants outline lists names but is not a speaking signal. Stateless: one tree in, names out. See [`zoom.rs`](../../apps/amie/src-tauri/src/speakers/zoom.rs).

### Microsoft Teams (Electron/WebView2)

The tree is empty until `AXManualAccessibility` is set on the app and on its window. Gallery tiles carry a name plus a CSS class marking the purple speaking border; if the gallery is not in the tree, Amie opens the People pane and uses the *minority style* among roster rows (new Teams bolds the speaker). Stateless, but it already uses a *relative* trick (minority among peers) rather than a fixed value. See [`teams.rs`](../../apps/amie/src-tauri/src/speakers/teams.rs).

### Google Meet in a Chromium browser

Measured in Brave (Chromium 153) on macOS 26, October 2026, over three live captures of two layouts: a six-person grid, and a 1:1 with a spotlight tile plus a floating self view (captured twice). The dump tool in section 8 recorded them. In the 80 samples replayed through the reader, every difference from a ground truth taken from Meet's own class marker was a cold-start sample; the live 1:1 run was not compared against that marker.

**What the tree exposes**

- With `AXManualAccessibility` set on the browser, the Meet tab appears as an `AXWebArea` with an `AXURL` (`https://meet.google.com/abc-defg-hij`) and the full DOM as `AXGroup` nodes with `AXDOMClassList`.
- Participant names are `AXStaticText` values inside each tile. All participants and the self view were present.
- The Meet page dropped out of the tree for 14 seconds in one live capture, most likely because the tab was not the visible one in its window. The cause was not confirmed. Chromium exposes only the visible tab's content.
- There is **no semantic speaking label.** Unlike Zoom, no accessible name says "speaking". The only difference is visual.

**What the speaking indicator really is**

Meet's class names (`dkjMxf`, `kssMZb`, ...) are obfuscated and change per deploy, so matching them would break silently. The stable observation is that a speaking tile is *slightly bigger* than the same tile quiet. Measured as `nodes + class tokens` in the tile's subtree:

| Tile type | Quiet | Speaking | Change | What changes |
| --- | --- | --- | --- | --- |
| Grid tile | 19 nodes / 34 tokens | 20 / 39 | +6 | one overlay node, plus tokens on a few elements |
| Spotlight tile (1:1) | 19 / 34 | 19 / 36-37 | +2-3 | **no new node**, tokens only |
| Self-view picture-in-picture | 21 / 37 | 22 / 43 | +7 | overlay node plus tokens (the self tile is 21 / 41 in the grid) |
| Camera off (not speech) | 23 / 49 | n/a | about +19 | avatar nodes, permanent |
| Self-view controls open (not speech) | 21 / 37-41 | 34 / 61 | over +30 | extra overlay, transient (cause not identified) |

The first version of the reader used "+1 node" alone and was correct on the grid but blind on the spotlight tile. Counting class tokens as well fixed it. Neither count refers to a particular class name.

**Layout varies.** One call is a grid of equal tiles, another a big spotlight plus a floating self view whose wrapper is a different size. Tile detection therefore cannot use size or position.

**The self tile cannot be identified from the tree.** Meet shows the real account name, not "You". In one capture the self view carried a "Others might see more of your background" button, in another it did not. The self tile is last in tree order in all captures, but that is a convention, not a guarantee.

## 5. Architectural decisions

### D1. Read the meeting app's accessibility tree

**Chosen:** macOS Accessibility, polled from outside the app.

**Alternatives considered**
- *Audio diarization.* Weak on overlapping and single-channel speech; already evaluated as the fallback, not the primary.
- *Browser extension or DevTools protocol.* Gives DOM access but requires installing something in the browser or relaunching it with a debug flag, which would drop the user out of a live call.
- *Meeting captions.* Name-labelled, but requires captions turned on and a per-app UI action.
- *Calendar or call APIs.* Need accounts and cover only one vendor.

**Consequence:** one OS permission (Accessibility), no per-app install, works while the call is live. The cost is dependence on each app's UI structure, which the rest of this document is about managing.

### D2. Separate OS access from interpretation

`ax.rs` snapshots a tree into `AxNode`; app modules are pure functions of that snapshot. This is why `zoom.rs`, `teams.rs` and `meet.rs` run in unit tests with synthetic trees, and why a recorded real tree can be replayed offline to check a reader.

**Rule:** a new app module must not call Accessibility, spawn processes or read the clock. It receives `AxNode` (and a monotonic timestamp if it keeps state).

### D3. One output contract

A reader produces **the set of remote display names currently speaking**. Everything downstream (hold, timeline, relabel, cut) depends only on that.

- Empty set means "nobody is marked speaking", not "unknown".
- `Err` means the read failed, and the poller keeps the previous timeline entry.
- The local user is excluded by the reader where it can tell, because the mic stream already labels the user.

### D4. Prefer semantic signals, then relative structure, never hard-coded class names

Order of preference when a new app is added:

1. **A semantic label in the tree** (Zoom: `, speaking`). Stable across versions.
2. **A relative structural signal**: the odd one out among peers (Teams roster style) or a tile compared with its own history (Meet).
3. **A fixed class or id.** Only as a last resort, isolated in one constant, covered by a test, and paired with a health warning when names are present but no speaking mark ever appears.

Obfuscated web UIs fall under 2. A relative signal survives renames; a class constant fails silently on the next deploy.

### D5. Stateless where possible; state owned by the reader that needs it

Zoom and Teams readers are stateless. Meet needs history (a tile's own quiet shape), so `MeetTracker` owns its baselines: a sliding-window minimum per tile name, with the window and tolerance as named constants. The poller stays unaware of it. State resets only after a 30 s absence, so a hidden tab does not wipe a speaker's baseline, while a different call starts clean.

### D6. Bounded, explainable heuristics

Every threshold is a named constant with the measurement behind it in a comment (`MAX_INDICATOR_DELTA`, `BASELINE_WINDOW_MS`, `SESSION_GAP_MS`, `MAX_TILE_GROWTH`). Guards for known false positives are separate and tested: a camera turning on, a re-layout where every tile changes at once, a transient overlay.

### D7. Cheap discovery, throttled

A browser tree read takes about a second. Native apps are found by bundle id at no cost, but a Meet call lives inside any of several browsers. Meet therefore runs *after* Zoom and Teams, scans browsers at most every 5 s while none is known, and reads each poll only once a pid is known.

### D8. Do not change user state beyond what is needed

Setting `AXManualAccessibility` makes Chromium build its accessibility tree and leaves it on until the browser restarts, at a small performance cost. Amie does this for Teams and now for browsers running Meet, and never presses buttons in a Meet tab. (Teams is the exception today: it can open the People pane.)

### D9. Verifiable without a real call

`apps/fake-zoom-app` stands in for Zoom with scripted speakers and synthesized speech. The dump tool plus a replay of recorded trees do the same job for Meet. A new app should come with one of these, so changes can be checked off-call.

## 6. Target modular design

Today `meeting.rs` is the integration point and it is **hard-coded**: a `match` on Zoom and Teams pids, then a fall-through to Meet, a `MeetingApp` enum with three variants, and matching strings in the frontend (`MeetingApp` in `transcript-types.ts`, labels in `SettingsPage.tsx`). Adding a fourth app means editing all of these. The readers themselves are already modular; the wiring is not.

Proposed shape (not implemented yet):

```rust
/// One supported meeting app or web app.
pub trait MeetingSource: Send {
    /// Stable id: "zoom", "ms-teams", "google-meet". Sent to the frontend as-is.
    fn id(&self) -> &'static str;
    /// Human name for the UI ("Google Meet").
    fn label(&self) -> &'static str;

    /// Cheap, throttled. Is there a call for this app right now, and where?
    fn locate(&mut self, now_ms: u64) -> Option<Target>;

    /// One poll. Pure interpretation of a fresh tree plus the source's own state.
    fn read(&mut self, target: &Target, now_ms: u64) -> Result<SpeakerRead, String>;
}

pub struct Target { pub pid: i32, pub enable_web_accessibility: bool }
pub struct SpeakerRead { pub speakers: BTreeSet<String>, pub present: BTreeSet<String> }
```

- A **registry** (`Vec<Box<dyn MeetingSource>>`, in priority order) replaces the `match`. The poller walks it, takes the first source with a located call, and falls through to the next only when that source reports nobody speaking (today's Zoom -> Teams -> Meet behaviour, now data instead of code).
- `locate` hides each app's discovery cost: bundle id for Zoom and Teams, throttled browser scan for Meet.
- `read` takes the tree through a shared helper so no source touches Accessibility directly (D2).
- The status API and the frontend read `id()` and `label()` from the active source, so the `MeetingApp` enum, its TypeScript union and the settings strings stop growing with each app.

Proposed layout, with no behaviour change:

```text
speakers/
  mod.rs
  source.rs            # MeetingSource, Target, SpeakerRead, registry
  platform/            # OS access, the only code that knows AXUIElement
    ax.rs  process.rs  permission.rs  identity.rs
  core/                # app-independent
    tree.rs  parse.rs  timeline.rs  label.rs  watch.rs  baseline.rs
  sources/
    zoom.rs  teams.rs  meet.rs
```

`baseline.rs` would take the sliding-window-minimum helper out of `meet.rs`, since any web app whose speaking indicator is a small visual change can use it.

### Adding a new app

1. Record real trees with `--print-ax` while the call is live, in at least two layouts and with someone speaking (section 8).
2. Choose the signal by the order in D4 and write the measurements into the module's doc comment.
3. Implement `MeetingSource` in `sources/<app>.rs`. Keep `read` pure over `AxNode`.
4. Unit-test with synthetic trees: one speaker, two, nobody, self-only, the known false positives.
5. Replay the recorded trees against a ground truth and note any cold-start gap.
6. Register it in priority order, add the id to the frontend union once (or none, after the registry change).
7. Update section 4 here.

Likely candidates and what they probably need: **Slack huddles / Discord** (Electron, same `AXManualAccessibility` route as Teams), **Webex and Whereby** (browser or native, check for a semantic label first), **Zoom in a browser** (a Meet-style tracker on `zoom.us/wc/` pages), **FaceTime** (native, likely a semantic label). Each is unmeasured; none should be assumed to resemble Meet.

## 7. Known limits and open problems

| Limit | Effect | Possible fix |
| --- | --- | --- |
| **Cold start (Meet)** | A speaker already talking when tracking starts is missed until they pause or someone else speaks. 1-3 s in recorded calls. | Gate the baseline on remote-audio activity: nobody speaks while system audio is silent, so a tile's quiet shape can be learned directly. Needs a signal from the audio pipeline. |
| **Self tile (Meet)** | Excluded only if its name equals the macOS account's full name or contains "(You)". A different Google name means your own speech can appear on remote lines when you talk over someone. | Learn which tile is yours by correlating tile changes with microphone activity. |
| **Hidden tab (Meet)** | No names while the Meet tab is not the visible tab of its window. | None from the tree. A picture-in-picture or separate window keeps it visible. |
| **Both tiles marked at a hand-off (Meet)** | A tile whose indicator lingers can briefly appear alongside the new speaker. | Already resolved downstream as `"Ada; Bob"` when it overlaps a segment. |
| **Poll latency (browsers)** | A tree read takes about 1 s, so the 250 ms poll becomes about 1 s while Meet is the source. | Read only the web area subtree after the first discovery. |
| **Browsers (Safari, Firefox)** | Not read. Their accessibility trees differ and were not investigated. | Measure them. |
| **Class-name drift** | Not affected for Meet, since nothing matches a class. A redesign that removes the speaking overlay or makes it permanent would. | A health warning when tiles are found for a minute and none ever changes. |
| **Windows** | Everything here is macOS Accessibility; other platforms return no names. | Separate platform implementation behind the same trait. |

## 8. Debugging toolkit

The agent shell and a plain terminal are not Accessibility-trusted, and macOS attributes a child process to its parent app. To read another app's tree, launch Amie Dev's own binary through the dev runner, so LaunchServices attributes the request to "Amie Dev", which already holds the grant:

```bash
cd apps/amie
# the Nemotron sidecar is gitignored; `scripts/setup-nemotron.sh` builds it, or copy it from another checkout
cargo build --manifest-path src-tauri/Cargo.toml
bash scripts/macos-exec-runner.sh "$PWD/src-tauri/target/debug/amie" \
  --print-ax com.brave.Browser --out /tmp/meet.txt --samples 40 --interval-ms 1000
```

- `--print-ax <bundle-id|pid>`: the app to read. Chromium accessibility is switched on first.
- `--out <file>`: required. A LaunchServices child has no terminal, so nothing prints.
- `--samples N --interval-ms M`: repeat to catch changes over time; each sample is a `=== sample i ===` section.
- `--speakers`: instead of the full tree, print the Meet reader's tiles (`name:nodes/tokens`) and the speakers it reports, with the same self-name filter the app uses.

Run it in the foreground; a backgrounded run is killed before it writes. The full tree of a Meet call is around 3,300 lines and a 40-sample capture about 20 MB, so keep captures out of the repository.

To judge a new reader without a live call, replay a recorded capture through it in a throwaway test and compare it with a known-good marker, as was done for Meet. When Accessibility behaves oddly, [`README.md`](../../apps/amie/README.md) covers grant and signing problems, and `/usr/bin/log show --last 30m --info --debug --process tccd` shows what macOS decided.

## 9. Status

| Item | State |
| --- | --- |
| Zoom, Teams readers | In `main` |
| Meet reader, tracker, browser discovery | Implemented on `claude/google-meet-speaker-id-aaea55`; 167 Rust tests pass |
| Meet replay against recorded calls | Done for two calls; only cold-start samples differ |
| Meet inside a full transcription session | Not yet run |
| `MeetingSource` registry and module reorganisation | Proposed in section 6, not started |
| Audio-gated baselines, self-tile learning | Proposed in section 7, not started |
