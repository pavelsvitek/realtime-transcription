import { describe, expect, it } from "vitest";
import {
  activeDeviceName,
  buildDeviceRows,
  effectiveChoice,
  parseStoredChoice,
} from "./audio-device-menu";

const devices = [
  { id: "coreaudio:BuiltInMicrophoneDevice", name: "MacBook Pro Microphone" },
  { id: "coreaudio:meetup", name: "Logitech MeetUp Speakerphone" },
];

describe("audio device menu", () => {
  it("marks the system default row when nothing is chosen", () => {
    const rows = buildDeviceRows(devices, devices[0].id, null);
    expect(rows[0]).toMatchObject({
      id: null,
      label: "System default (MacBook Pro Microphone)",
      selected: true,
    });
    expect(rows.filter((r) => r.selected)).toHaveLength(1);
  });

  it("marks the chosen device", () => {
    const rows = buildDeviceRows(devices, devices[0].id, "coreaudio:meetup");
    expect(rows.find((r) => r.selected)?.label).toBe("Logitech MeetUp Speakerphone");
  });

  it("treats an unplugged choice as the system default", () => {
    expect(effectiveChoice("coreaudio:gone", devices)).toBeNull();
    const rows = buildDeviceRows(devices, devices[0].id, "coreaudio:gone");
    expect(rows[0].selected).toBe(true);
  });

  it("names the device in use", () => {
    expect(activeDeviceName(devices, devices[0].id, "coreaudio:meetup")).toBe(
      "Logitech MeetUp Speakerphone",
    );
    expect(activeDeviceName(devices, devices[0].id, null)).toBe("MacBook Pro Microphone");
    expect(activeDeviceName([], null, null)).toBeNull();
  });

  it("parses stored choices defensively", () => {
    expect(parseStoredChoice(null)).toEqual({ input: null, output: null });
    expect(parseStoredChoice("not json")).toEqual({ input: null, output: null });
    expect(parseStoredChoice('{"input":"a","output":3}')).toEqual({ input: "a", output: null });
  });
});
