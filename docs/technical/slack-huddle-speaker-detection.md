# Slack Huddle speaker identification: UI tree investigation

Investigation notes and architecture plan for reading active speakers and local mute state from the Slack desktop app (`com.tinyspeck.slackmacgap`) on macOS via Accessibility (`AXUIElement`), plus the design of the synthetic stand-in app (`apps/fake-slack-app`).

Status: **speaking & mute signals measured (solo huddle).** Collected on 2026-11-23 against Slack `4.50.128` and `4.53.292` (Electron) on macOS. Only the local user was in the huddle during capture; remote participant tile IDs and alternate layouts (expanded view, video-on, docked sidebar mini-huddle) remain to be verified in a multi-person huddle (see Section 4).

## 1. Environment and process details

| Property | Observed value |
| --- | --- |
| App path | `/Applications/Slack.app/Contents/MacOS/Slack` |
| Bundle identifier | `com.tinyspeck.slackmacgap` |
| Versions tested | `4.50.128` and `4.53.292` (Electron) |
| Accessibility unlock | Setting `AXManualAccessibility = true` and `AXEnhancedUserInterface = true` on the application and window elements immediately exposes the full Chromium `AXWebArea` tree, including `AXDOMIdentifier` and `AXDOMClassList` (identical to Teams in `apps/amie/src-tauri/src/speakers/meeting/ax.rs`). |

Helper processes (`Slack Helper (Renderer)`, `Slack Helper`, `chrome_crashpad_handler`, `ShipIt`) run alongside the main executable, so bundle-ID lookup via `NSRunningApplication.runningApplications(withBundleIdentifier: "com.tinyspeck.slackmacgap")` resolves the main UI process directly.

### Version delta (`4.50.128` → `4.53.292`)

The huddle DOM structure and semantic BEM classes (`p-view_contents--huddle`, `p-huddle_grid_component`, `p-huddle_peer_tile`, `p-huddle_peer_tile__mic_overlay`, `p-huddle_peer_tile__overlay--active_speaker`) are unchanged. Two minor Chromium/Electron differences were observed in `4.53.292`:

- `AXScrollArea` wraps `AXWebArea`.
- Controls and cells populate **both** `AXTitle` and `AXDescription` (in `4.50.128` many buttons/cells only set `AXDescription`), so readers should check `title.or(description)` just like `speakers/teams.rs`.

## 2. Observed Accessibility tree (measured)

### 2.1 Window topology during an active huddle

When a huddle is open in its popped-out window, Slack exposes two `AXStandardWindow` elements:

1. **Huddle window** (compact mode, e.g. `696x356`, title `<Channel or DM Name> - <Workspace> - Slack`):
   - Contains `AXScrollArea` → `AXWebArea` → `AXGroup` (`cls=p-view_contents p-view_contents--primary p-view_contents--huddle`).
   - Houses the participant grid (`AXTable`, `cls=p-huddle_grid_component`) and the footer action bar (`AXToolbar`, `AXTitle`/`AXDescription="Huddles actions"`).
2. **Main Slack window** (e.g. `1512x895`, title `<Channel or DM Name> (<Type>) - <Workspace> - Slack [Main] ...`):
   - While in a huddle, the main workspace wrapper gains `p-client_workspace_wrapper--huddle_bottom_bar` and renders a bottom status bar (`cls=... bottomBar__...`) containing:
     - `AXStaticText` (`val="Huddle with "`), `AXStaticText` (`val="<Name>"`)
     - `AXToolbar` (`desc="Huddles actions"`) with `AXButton` (`desc="Bring huddle to front"`) and `AXButton` (`desc="Leave Huddle"`).
   - Once the huddle ends, the popped-out window closes and the bottom bar disappears; the channel header button reverts from `Leave huddle` to `Start huddle with ...`.

### 2.2 Participant tile hierarchy (`p-huddle_grid_component`)

Captured from the popped-out huddle window in audio-only compact mode:

```text
AXGroup | cls=p-view_contents.p-view_contents--primary.p-view_contents--huddle
  AXGroup | cls=p-huddle_window__content_container.p-huddle_window__content_container--compact_mode
    AXGroup | desc="Gallery" | cls=p-huddle_window_content
      AXToolbar | desc="Gallery" | cls=p-huddle_window_content__gallery_toolbar
        AXGroup | cls=p-huddle_compact_av_pane.p-huddle_compact_av_pane--audio_only_view
          AXTable | cls=p-huddle_grid_component
            AXGroup | cls=p-huddle_grid_component__grid
              AXRow | title="View Pavel Svitek's profile" | cls=p-bp__grid_row.offscreen
                AXCell | title="View Pavel Svitek's profile"
                       | desc="View Pavel Svitek's profile"
                       | id="huddle-grid-gridcell-self_U0566T6BP0S"
                       | cls=p-huddle_peer_tile | 150x150
                  AXGroup | 150x150
                  // State 1 — MUTED:
                  AXGroup | cls=p-huddle_peer_tile__mic_overlay.p-huddle_peer_tile__overlay--compact | 24x24
                    AXGroup | cls=micIcon__XE9Cj.micIconContainer___DE57.p-huddle_mic_icon | 20x20
                      AXImage | 20x20
                  // State 2 — UNMUTED & SPEAKING (appears live during speech bursts):
                  AXGroup | cls=p-huddle_peer_tile__mic_overlay.p-huddle_peer_tile__overlay--active_speaker.p-huddle_peer_tile__overlay--compact | 24x24
                    AXGroup | cls=micIcon__XE9Cj.micIconContainer___DE57 | 20x20
                  // State 3 — UNMUTED & SILENT: no mic_overlay child
                  AXGroup | cls=p-huddle_peer_tile__activity_icons_container.p-huddle_peer_tile__activity_icons_container--medium-tile
              AXGroup | 150x150
                AXGroup | id="huddle-grid-gridcell-self_U0566T6BP0S-a11y_huddle_peer_tile_description" | cls=offscreen
                  AXStaticText | val="Audio, Muted"   [or "Audio" when unmuted, whether silent or speaking]
            AXColumn
              AXCell | ... [Chromium duplicates every AXTable cell under AXColumn]
```

Note that Chromium exposes table cells under both `AXRow` and `AXColumn`, so any tree walker must deduplicate tiles by `AXDOMIdentifier` (or only read tiles inside `p-huddle_grid_component__grid` / `AXRow`).

### 2.3 Expanded / full-screen mode (`--full_mode`)

Measured in Slack `4.53.292` after clicking `Change view` (`1512x895`, `p-huddle_window__content_container--full_mode`, `p-huddle_window_content--expanded-view`):

- `AXTable` (`p-huddle_grid_component`) and `AXCell` (`p-huddle_peer_tile`, `id="huddle-grid-gridcell-self_<USER_ID>"`) stay identical.
- Inside `AXCell`, an additional `AXButton` (`cls=p-huddle_peer_tile__name_overlay p-huddle_peer_tile__name_overlay--unmuted`, `title`/`desc="video is off, audio is on"`) and `AXPopUpButton` (`More actions`) are rendered.
- **When speaking**, **two** children inside `AXCell` carry the same semantic BEM class `p-huddle_peer_tile__overlay--active_speaker`:
  1. `AXGroup` (`cls=p-huddle_peer_tile__mic_overlay p-huddle_peer_tile__overlay--active_speaker`) appears (same as compact mode, minus `--compact`).
  2. `AXButton` (`p-huddle_peer_tile__name_overlay`) gains `p-huddle_peer_tile__overlay--active_speaker`.
- `AXToolbar` (`"Huddles actions"`) moves out of `p-huddle_footer` into sibling `AXGroup` (`cls=footerTarget__vxx2n`), keeping the same `"Mute microphone"` / `"Unmute microphone"` button.

Therefore, checking `has_class_in_tree(cell, "p-huddle_peer_tile__overlay--active_speaker")` on each `p-huddle_peer_tile` works identically in **both** compact and expanded/full-screen modes.

### 2.4 Footer toolbar (`Huddles actions`)

```text
AXGroup | cls=p-huddle_footer.p-huddle_footer--compact_mode
  AXToolbar | title="Huddles actions" | desc="Huddles actions"
    AXGroup | cls=c-icon_button.c-icon_button--size_medium.segmentedButton__vDuKx
      AXButton | desc="Unmute microphone"   [muted]
               | desc="Mute microphone"     [unmuted; gains class buttonToggledOn__Kuvfg]
      AXPopUpButton | desc="Audio settings"
    AXGroup | ...
      AXButton | desc="Turn on camera"
      AXPopUpButton | desc="Video settings"
    AXCheckBox | desc="Share your screen"
    AXButton | desc="Raise hand"
    AXButton | desc="Add reaction"
    AXButton | desc="Take meeting notes"
    AXButton | desc="Show/hide Thread"
    AXButton | desc="More actions"
    AXButton | desc="Leave Huddle" | cls=...leaveButton__wzISw...
```

## 3. Verified signals (muted, silent, and active speaker)

Measured across three speech bursts at 80 ms polling in Slack `4.53.292` (bursts at `t=0.65–2.10s`, `3.54–5.30s`, `7.15–8.51s`):

| Signal | Where | Muted | Unmuted (silent) | Unmuted (speaking) | Notes |
| --- | --- | --- | --- | --- | --- |
| Active huddle detection | Any `AXWindow` | `p-view_contents--huddle` / `p-huddle_grid_component` | Same | Same | Also reflected in main window `AXButton` `Leave Huddle` |
| Local user identity | `AXCell.p-huddle_peer_tile` `AXDOMIdentifier` | `huddle-grid-gridcell-self_<USER_ID>` | Same | Same | `self_` prefix identifies the local user without relying on localized `(You)` text |
| Display name | `AXCell.p-huddle_peer_tile` `AXTitle`/`AXDescription` (and `AXRow` `AXTitle`) | `"View <Display Name>'s profile"` | Same | Same | Strip leading `"View "` and trailing `"'s profile"` |
| **Active speaker indicator** | Descendant `AXGroup` of `AXCell.p-huddle_peer_tile` | Absent | Absent | **`p-huddle_peer_tile__overlay--active_speaker`** in `AXDOMClassList` | Semantic BEM class (not a CSS-module hash); appears/disappears cleanly with speech bursts |
| Tile mute overlay | Descendant `AXGroup` of `AXCell.p-huddle_peer_tile` | `p-huddle_peer_tile__mic_overlay` (without `--active_speaker`, with `p-huddle_mic_icon` child) | Absent | `p-huddle_peer_tile__mic_overlay` + `p-huddle_peer_tile__overlay--active_speaker` | Check `--active_speaker` specifically — do not match `mic_overlay` alone! |
| Offscreen tile text | `id="<cell-id>-a11y_huddle_peer_tile_description"` | `"Audio, Muted"` | `"Audio"` | `"Audio"` | Does **not** change when speaking |
| Local mic mute (`self_muted`) | `AXButton` inside `AXToolbar` (`"Huddles actions"`) | `"Unmute microphone"` | `"Mute microphone"` (`buttonToggledOn__...`) | `"Mute microphone"` (`buttonToggledOn__...`) | Directly maps to `MeetingRead.self_muted` (same pattern as Teams `microphone-button`) |

## 4. Remaining items to verify in a multi-person huddle

1. **Remote participant `AXDOMIdentifier` and speaking overlay:** Confirm whether remote tiles use `huddle-grid-gridcell-<USER_ID>` (or another prefix without `self_`), whether `AXDescription` is also `"View <Name>'s profile"`, and that remote tiles emit the exact same `p-huddle_peer_tile__overlay--active_speaker` class when they speak.
2. **Remaining alternate layouts:**
   - Video-on and screen-sharing layouts (whether tile classes or `p-huddle_peer_tile__overlay--active_speaker` change when video is enabled).
   - Docked sidebar mini-huddle (closing the popped-out huddle window while staying in the huddle): whether participant tiles and `--active_speaker` still exist in the main Slack window.
3. **Possessive & localized names:** Confirm how Slack formats `"View <Name>'s profile"` for names ending in `s` (e.g. `"View Dennis's profile"` vs `"View Dennis' profile"`) and non-English locales.

## 5. Planned Amie integration

Once Section 4 is verified, Slack Huddle support fits directly into `apps/amie/src-tauri/src/speakers/`:

- `meeting/process.rs`: add `pub const SLACK_BUNDLE: &str = "com.tinyspeck.slackmacgap";`.
- `meeting.rs`: add `MeetingApp::Slack`, read with `ax::application_tree(pid, true)` (Electron flag on), and arbitrate when multiple meeting apps are open (Slack is often running all day even when idle, so `running_meeting_app()` / `read_meeting_macos()` must only claim Slack as active when a huddle container is actually present in the tree, not merely because `Slack.app` is running).
- `speakers/slack.rs`: pure `AxNode -> SlackRead` parser (mirroring `speakers/teams.rs`), finding `AXCell` nodes with class `p-huddle_peer_tile` (deduplicated by `AXDOMIdentifier`), extracting display names from `"View <Name>'s profile"`, identifying self via `-self_` in `AXDOMIdentifier`, marking active speakers by descendant class `p-huddle_peer_tile__overlay--active_speaker`, and reading `self_muted` from the `Huddles actions` mic button.

## 6. Synthetic stand-in app (`apps/fake-slack-app`)

To develop and test Slack Huddle speaker identification without needing live teammates on a call, `apps/fake-slack-app` mirrors `apps/fake-zoom-app`:

- Claims Slack's bundle identifier (`com.tinyspeck.slackmacgap`) and refuses to launch while real Slack is running (except for `--print-ax` / `--snapshot` self-inspection runs).
- Uses native AppKit views exposing real `AXDOMIdentifier` and `AXDOMClassList` attributes so `AXUIElementCopyAttributeValue` reads the exact Electron/Chromium tree shape recorded in Section 2, including the measured `p-huddle_peer_tile__overlay--active_speaker` child during speech, `p-huddle_peer_tile__mic_overlay` + `"Audio, Muted"` when muted, and `"Mute microphone"` / `"Unmute microphone"` in `Huddles actions`.
- Plays the same JSON scenarios and macOS `say` voices as `fake-zoom-app`, and supports interactive local mic muting (`--muted`, footer mic button, and `⌘⇧M`).
