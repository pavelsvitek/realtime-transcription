# External audio devices: investigation notes

Status: **fixed**. The device menu and the output-tap fix are described in `system-audio-output-tap.md`. This file is the original investigation, kept for the data.

Original status: investigation only. Collected 2026-11-12 on the developer's MacBook with a Logitech MeetUp
conferencing speakerphone and an external display connected. The Amie app was deliberately **not launched** during
collection (the developer was in a meeting), so nothing below comes from a live Amie run. Everything is from Core
Audio queries, `coreaudiod` logs, and reading the code. Section 6 lists what still has to be verified at runtime.

Reported symptom: after connecting an external display and an external mic and speakers (Logitech MeetUp), Amie does
not recognize the new mic and speakers and cannot transcribe from them.

## 1. Summary

> Update: a further cause was found after the menu shipped. cpal's loopback reads a device's *microphone* when the output also has an input (USB headset, MeetUp), so system audio was silent on those devices. See `system-audio-output-tap.md`.

The most likely cause is that Amie only ever follows the macOS **default** devices. It has no device selection and no
awareness of other devices. Connecting the MeetUp did **not** change the macOS defaults, so Amie keeps using the
built-in mic and speakers.

1. **The MeetUp never became the default input or output.** macOS activated it but kept the MacBook devices as default.
   Amie opens `cpal::default_input_device()` for the mic and `cpal::default_output_device()` for system audio.
   Both still resolve to the built-in devices.
2. **System audio is a tap on one specific output device** (the default output at start). If the call audio plays out of
   the MeetUp while the default output is the MacBook speakers, the tap records silence.
3. **The MeetUp only supports 32 kHz**, unlike the built-ins (44.1/48/88.2/96 kHz). Not a blocker by itself, but it
   has to be handled when the user does select it (Amie reads the device's own default config, so it should work).
4. **A device change while transcribing is never handled.** `ARCHITECTURE.md` already lists "Microphone hot-swap" as a
   known gap. The listener in `audio_device/macos.rs` only updates the *device label in the UI*; it never reopens the
   audio streams. So even if the user switches the default mid-call, the label changes but the captured audio does not.
5. The device label is misleading: `classify_device` maps any USB device to `UsbHeadset`, so the MeetUp would be shown
   as a headset.

Also noted: at collection time the MeetUp was not used by anything (`running somewhere = 0`), including the
developer's own meeting, so the call app was also not on the MeetUp. This matters for the verification plan.

## 2. Environment at collection time

- macOS: Darwin 25.5.0 (macOS 26 line)
- Amie: dev build in the repo; `/Applications/Amie.app` (release) was already running as pid 27802 (the developer's own
  process, not touched). Several `amie_mcp` debug processes also running.
- Meeting apps with virtual audio drivers installed: Zoom, Microsoft Teams.
- `cpal` 0.17.3, `coreaudio-rs` 0.14.2, `objc2-core-audio` 0.3 (`apps/amie/src-tauri/Cargo.toml`).

## 3. Collected data

### 3.1 `system_profiler SPAudioDataType`

| Device | Transport | In ch | Out ch | Sample rate | macOS default |
|---|---|---|---|---|---|
| SyncMaster (external display) | HDMI | 0 | 2 | 48000 | none |
| **Logitech MeetUp Speakerphone** | **USB** | **2** | **2** | **32000** | **none** |
| MacBook Pro Microphone | Built-in | 1 | 0 | 48000 | **input** |
| MacBook Pro Speakers | Built-in | 0 | 2 | 48000 | **output + system output** |
| Microsoft Teams Audio | Virtual | 1 | 1 | 48000 | none |
| ZoomAudioDevice | Virtual | 2 | 2 | 48000 | none |

### 3.2 Core Audio probe (`apps/amie/scripts/list-audio-devices.swift`)

Run with `swiftc list-audio-devices.swift -o /tmp/devs && /tmp/devs`. It only reads properties, so it does not open any
stream and does not trigger the microphone indicator. Output (device ids change between sessions):

```
default input=95 output=88 systemOutput=88
id=122 name=Logitech MeetUp Speakerphone uid=AppleUSBAudioEngine:Logitech:Logitech MeetUp Speakerphone:0x0621756c:1,2 model=Logitech MeetUp Speakerphone:046D:0867
   transport=usb  in=2 out=2 rate=32000.0 avail=32000-32000
   alive=1 running=0 runningSomewhere=0 hidden=0
   inLatency=50 outLatency=34 isDefaultIn=false isDefaultOut=false
id=95 name=MacBook Pro Microphone uid=BuiltInMicrophoneDevice model=Digital Mic
   transport=bltn in=1 out=0 rate=48000.0 avail=44100-44100,48000-48000,88200-88200,96000-96000
   alive=1 running=0 runningSomewhere=1 hidden=0
   isDefaultIn=true
id=88 name=MacBook Pro Speakers uid=BuiltInSpeakerDevice model=Speaker
   transport=bltn in=0 out=2 rate=48000.0 avail=44100-44100,48000-48000,88200-88200,96000-96000
   runningSomewhere=1 isDefaultOut=true
id=107 name=SyncMaster uid=4C2D080E-0000-0000-0E1B-010380794478  transport=hdmi in=0 out=2 rate=48000  (output only)
id=78  name=Microsoft Teams Audio  transport=virt in=1 out=1 rate=48000
id=100 name=ZoomAudioDevice        transport=virt in=2 out=2 rate=48000
```

Key points:

- `isDefaultIn` / `isDefaultOut` are true only for the MacBook built-ins.
- The MeetUp is alive, 2-in / 2-out, and fixed at **32000 Hz** (`avail=32000-32000`).
- The MeetUp is not running, so no process (the call app included) was using it.
- The built-in mic and speakers are `runningSomewhere=1`: the developer's call app was using them.

### 3.3 `coreaudiod` log (`/usr/bin/log show --last 40m`, process `coreaudiod`)

```
09:45:15  FindPreferredDefaultDevice 'dOut'/'sOut'/'shrd' -> preferred[0] 'AppleUSBAudioEngine:Sony:IER-EX15C:000000:1,2'
          (earlier session: a Sony USB-C headset was the preferred device)
10:09:12  FindPreferredDefaultDevice 'dIn ' -> preferred[1] 'BuiltInMicrophoneDevice'/'imic'
          'dOut'/'sOut'/'shrd' -> preferred[1] 'BuiltInSpeakerDevice'/'ispk'
10:10:39  HALS_Device::Activate: AppleUSBAudioEngine:Logitech:Logitech MeetUp Speakerphone:0x0621756c:1,2
10:10:39  FindPreferredDefaultDevice 'dIn ' -> preferred[1] BuiltInMicrophoneDevice, 'dOut' -> preferred[1] BuiltInSpeakerDevice
10:10:39  LogVolumeChange ... Logitech MeetUp ... input volume 1.0
10:11:23, 10:11:30  same: defaults still resolve to the built-ins
```

What this shows:

- macOS decides the default from a **preference list**. Index 0 is the device the user last chose or a device that
  claims priority (a Sony headset earlier today). Without such an entry the list falls to index 1: the built-ins.
- The MeetUp was activated at 10:10:39 and macOS re-ran the default selection **five times** and chose the built-ins
  every time. So macOS did not auto-select it (typical for a device the user has never picked in System Settings).
- This is not a macOS bug and not an Amie bug. It is the expected result, and Amie does not offer any other way to
  choose a device.

### 3.4 Amie settings

`~/Library/Application Support/com.pavel.amie/settings.json` contains only `selected_model`. There is no stored input
device, output device or any other audio preference. The app has nothing to persist a device choice in yet.

## 4. How Amie picks devices today (code walk)

All paths under `apps/amie/src-tauri/src/`.

| Concern | Code | Behaviour |
|---|---|---|
| Mic selection | `transcription/mic_input.rs` `open_mic_stream` | `cpal::default_host().default_input_device()`. No other device is considered. |
| Mic stream config | `transcription/cpal_capture.rs` `open_input_stream` | Uses `device.default_input_config()` (device's own rate and channels). Channels are averaged to mono. Rate is passed to the ASR pipeline for resampling to 16 kHz. |
| System audio selection | `transcription/system_audio.rs` `open_system_audio_stream` | `default_output_device()`, then `open_loopback_stream` using `default_output_config()`. |
| System audio mechanism | cpal 0.17.3 `host/coreaudio/macos/loopback.rs` | Creates a process tap (`CATapDescription`) bound to the **output device UID** with all processes included and a private aggregate device. Only audio rendered to that one device is captured. |
| Capture start | `transcription/service.rs` `start` -> `spawn_stream_worker` -> `capture::open_capture` | Devices are opened once, at start. Failures become `AppError::Capture`. |
| Device label in UI | `audio_device/macos.rs` `get_default_input_device`, `spawn_device_monitor` | Listens to `kAudioHardwarePropertyDefaultInputDevice` (and the built-in output data source) and emits `event_names::DEVICE`. **UI only.** It does not touch the running capture. It does **not** listen to the default *output* device, nor to the device list. |
| Device classification | `audio_device/mod.rs` `classify_device` | Any `Transport::Usb` -> `DeviceKind::UsbHeadset`. Meant for headsets, wrong for a speakerphone. HDMI, DisplayPort, Virtual and Aggregate fall to `Unknown`. |

Two things in this table make the situation worse than "the user has to pick the device":

- **No reopen on change.** The capture streams are owned by `StreamPair._capture` for the whole session. Neither a
  default-input change nor a default-output change closes and reopens them. `ARCHITECTURE.md` ("Microphone hot-swap")
  describes the intended behaviour, but it is not implemented.
- **Output change is invisible.** If the user switches the system output to the MeetUp *during* a call, the tap stays
  attached to the old device (the built-in speakers) and records silence. Nothing in the UI says so, and the
  device monitor does not even see the event.

## 5. Failure scenarios

Using the data above, in order of likelihood for the reported symptom.

| # | Scenario | Mic | System audio | Why |
|---|---|---|---|---|
| A | MeetUp connected, defaults unchanged (the state at collection time) | built-in mic | tap on built-in speakers | The call app is probably using the built-ins too. Amie works, but not on the MeetUp. If the user speaks into the MeetUp while the call app uses it, Amie hears nothing. |
| B | User sets MeetUp as default **before** starting a session | MeetUp (32 kHz stereo, downmixed) | tap on MeetUp | Should work. Needs runtime confirmation (section 6). |
| C | User sets MeetUp as default **during** a session | built-in mic still open | tap still on built-in speakers | The UI label changes, but both streams stay on the old devices: silence. |
| D | Call app routes to the MeetUp via its own setting (Zoom, Teams, Meet), system default untouched | built-in mic | tap on built-in speakers (silent) | Many meeting apps keep their own device choice and ignore the macOS default. Amie sees neither the mic nor the speakers the call actually uses. |
| E | Call app uses Zoom/Teams virtual device | virtual device never opened | tap on the real output | The tap is bound to the output device, so audio is captured only if the app actually renders there. |

Scenarios C and D are the most likely to produce "Amie does not recognize the new devices". D matters a lot in
practice, since it is exactly how conferencing hardware is used.

## 6. What is still unverified (needs a runtime check when the developer is free)

Collected without launching Amie, so these are open:

1. **What Amie shows in the UI today** with the MeetUp connected but not default (expect: built-in mic label).
2. **Scenario B**: set the MeetUp as default input and output, start a session, confirm both streams produce audio.
   In particular, check that the 32 kHz stereo input is accepted by `default_input_config()` and that the ASR
   pipeline resampler handles 32000 -> 16000 correctly. Check the Rust log for `Opening cpal audio stream` and
   `cpal stream error`.
3. **Scenario C**: switch default devices during a session and capture the Rust log. Expect no stream reopen.
4. **Tap on a non-default device**: confirm the process tap works when attached to the USB output (not just the
   built-in) and that `CATapMuteBehavior::Unmuted` leaves the MeetUp output audible.
5. **Mic permission**: macOS microphone permission is per app, not per device, so it should not be involved. Confirm no
   new TCC prompt appears for USB devices. If needed, use the tccd log method in the memory note
   `debug-macos-tcc-with-tccd-log`.
6. **Echo**: the MeetUp does hardware echo cancellation. Check whether the mic stream still carries the remote
   voice. This affects the dual-track assumption in `docs/technical/macos-capturing-audio.md`.
7. **Hot-unplug**: unplug the MeetUp during a session and check what `cpal stream error` does to the worker.
8. **HDMI audio**: the external display (SyncMaster) also exposes an output. Check that selecting it as the default
   output works with the tap too.

Debugging aids, none of which start the app:

```bash
swiftc apps/amie/scripts/list-audio-devices.swift -o /tmp/devs && /tmp/devs
/usr/bin/log show --last 10m --style compact --predicate 'process == "coreaudiod" AND eventMessage CONTAINS[c] "FindPreferredDefaultDevice"'
system_profiler SPAudioDataType
```

For a live run use `apps/amie/scripts/macos-exec-runner.sh` (the dev runner) with `RUST_LOG=amie_lib=debug`
(see `ARCHITECTURE.md`, "Instrumentation points"). Not checked in this investigation.

## 7. Proposed fixes (for the implementation branch)

In priority order. The first two address the reported symptom directly.

1. **Device selection.** Enumerate input and output devices (name, uid, transport, channel counts, sample rates, alive
   flag) and let the user pick the mic and the system-audio output, with "System default" as the default entry.
   Persist **UIDs**, not ids (ids change between sessions; the MeetUp uid above is stable). Add the fields to
   `settings.json`. Pass the chosen device into `open_mic_stream` and `open_system_audio_stream` instead of calling
   `default_*_device()`. cpal exposes `host.input_devices()` / `output_devices()` and Core Audio gives the UID.
2. **Follow defaults and reopen on change.** Extend `audio_device/macos.rs` to listen to
   `kAudioHardwarePropertyDefaultOutputDevice` and `kAudioHardwarePropertyDevices`, not only the default input. When
   the effective device changes during a session, tear down and reopen that stream (the hot-swap design in
   `ARCHITECTURE.md`), keep the worker and segment counters running, and emit the new device name. A missing device
   should surface an error status, not silence.
3. **Silence detection for system audio.** If the tap delivers only zeros for N seconds while a session is active, show
   a hint ("No audio from <device>. Is the call playing on another output?"). Silent failure is the worst part of
   scenarios C and D. The mic path already has a silence banner; mirror it for the system stream.
4. **Classification.** Replace "USB -> headset" with logic that uses name and channel counts, and add kinds for
   speakerphone, display (HDMI/DisplayPort) and virtual devices so the UI label is accurate.
5. **Sample-rate robustness.** Add a unit/integration test that feeds 32 kHz stereo into the capture and resample path.
6. **Meeting-app routing (scenario D).** Longer term: tap the call app's *process* instead of an output device
   (`CATapDescription` supports a process list), so audio is captured wherever the app routes it. Research needed for
   Zoom, Teams and Meet in Brave. This changes the capture design and should be its own work item.

## 8. Test plan for the fix

- Unit: UID-based device resolution (present, missing, renamed), classification of the table in section 3.1,
  settings round-trip.
- Manual matrix, on this hardware: {built-ins, MeetUp, HDMI display} x {default changed before start, during session,
  unplugged during session}. Record transcript, Rust log and system-audio RMS for each.
- Regression: AirPods and the Sony USB-C headset (the 09:45 log shows it was used earlier today).

## 9. Files

- `apps/amie/scripts/list-audio-devices.swift`: the probe used above (added in this branch).
- Code under review: `transcription/{mic_input,system_audio,cpal_capture,capture,service}.rs`,
  `audio_device/{mod,macos}.rs`.
