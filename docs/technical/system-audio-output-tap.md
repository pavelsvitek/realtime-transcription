# System audio capture: output tap

How Amie records "what the call sounds like" on macOS, and why it stopped working
on USB headsets and conferencing speakerphones. Fixed in
`apps/amie/src-tauri/src/transcription/output_tap.rs`.

## Symptom

With a USB-C headset (Sony IER-EX15C) as the default output and YouTube playing,
Amie transcribed nothing from system audio. Built-in speakers, the 3.5 mm jack and
Bluetooth headphones all worked. The same bug affects the Logitech MeetUp
speakerphone (see `external-audio-devices-investigation.md`).

Evidence from the session debug dump (`apps/amie/debug/<session>/system.wav`):

- the system stream opened the right device (`IER-EX15C`, 48 kHz, no dropped frames),
- a Core Audio process list showed the browser rendering audio,
- but the captured audio sat at RMS about 0.001 with rare small peaks, roughly 50x
  quieter than speech, so the ASR got nothing.

## Root cause

System audio is captured with a Core Audio **process tap** (macOS 14.2+) bound to an
output device. A tap is not readable by itself: it is wrapped in a private
**aggregate device** that exposes it as an input, and that aggregate is read like a
microphone.

Amie used cpal 0.17's loopback for this. In cpal's
`host/coreaudio/macos/device.rs`, `build_input_stream_raw` decides like this:

```
if self.supports_input() { open the device's own input }   // normal microphone
else                     { create tap + aggregate, read it } // loopback
```

So loopback is only used for outputs with **no input streams**. A USB headset or a
speakerphone has an output stream *and* an input (microphone) stream, so cpal
silently opened its microphone. The "system audio" stream was then the headset
mic: faint room noise, no call audio.

Stream layout of the affected devices (from Core Audio):

| Device | Streams |
|---|---|
| IER-EX15C (USB-C headset) | `[0]` output, `[1]` input |
| Logitech MeetUp | output + input |
| MacBook Pro Speakers | `[0]` output only |
| Bluetooth headphones (A2DP) | output only |

It was not a permission problem, a sample-rate problem, the stream index passed to
the tap (the output is index 0) or volume/mute.

## Fix

`OutputTap` creates the tap and aggregate itself and cpal then opens the aggregate as
an ordinary input device, which has no output stream and so takes cpal's normal path.

1. `OutputTap::new(output_uid)`
   - `CATapDescription` with an empty process list and `exclusive = true`, which
     means every process, bound to the output device UID, stream 0.
   - mute behavior `Unmuted`, so audio still reaches the headphones. Private.
   - `AudioHardwareCreateProcessTap`, then `AudioHardwareCreateAggregateDevice`
     with the tap in its tap list, drift compensation on, private, with a unique UID
     `com.amie.SystemAudioTap.<uuid>`.
2. `OutputTap::input_device()` finds the aggregate in cpal's device list by id
   `coreaudio:<aggregate uid>`. A private aggregate is invisible to other processes
   but visible to the one that created it, so cpal can see it. It retries for about
   a second because the device appears asynchronously.
3. `system_audio.rs` opens that device with `open_input_stream` (downmix to mono,
   same pipeline as the mic) and reports the *speakers'* name as the device name.
4. Drop order matters: `SystemAudioCapture` declares `stream` before `_tap`, so the
   stream stops before the aggregate and tap are destroyed.

The aggregate is named `Amie system audio tap`. `audio_device/devices.rs` hides it
from the device picker.

The tap is created per stream. Switching the Speakers selection (or the system
default output changing) reopens the stream, which creates a new tap on the new
device and destroys the old one (`TranscriptionService::reapply_devices`).

## Notes and limits

- Code adapted from cpal's `loopback.rs` (Apache-2.0/MIT); it needed
  `objc2-core-foundation` as a direct dependency and the `NSValue` feature of
  `objc2-foundation` (for `NSNumber`).
- Permission: macOS asks for System Audio Recording. If the tap cannot be created the
  error says so and is shown as the capture banner on start.
- The tap follows one output device. If a call app plays on a different device than
  the one selected, the tap hears silence. Tapping the call app's process instead is
  the longer-term answer (see "Proposed fixes" in the investigation doc).
- Verified by hand: YouTube through the IER-EX15C now transcribes. Not yet run with
  the MeetUp.

## Diagnosing a quiet system stream

- Check `meta.json` in the debug dump: `deviceName` for the `system` stream should be
  the speakers you expect.
- Compute RMS per 10 s of `system.wav`. About 0.001 means you are hearing noise, not
  the output.
- `apps/amie/scripts/list-audio-devices.swift` shows each device's channels and
  whether it is running. A device with both input and output channels is affected by
  the cpal behaviour above.
