import { describe, expect, it } from "vitest";
import { transcriptIdlePrivacyLine } from "./TranscriptIdle";

describe("transcriptIdlePrivacyLine", () => {
  it("names the built-in mic when it is the input", () => {
    expect(transcriptIdlePrivacyLine("both", null, "builtInMic")).toBe(
      "Transcribed on this Mac with Internal MacBook microphone",
    );
  });

  it("names an external mic", () => {
    expect(transcriptIdlePrivacyLine("mic", "AirPods Pro", "bluetoothEarbuds")).toBe(
      "Transcribed on this Mac with AirPods Pro microphone",
    );
  });

  it("skips the mic when only system audio is captured", () => {
    expect(transcriptIdlePrivacyLine("system", "AirPods Pro", null)).toBe(
      "Transcribed on this Mac",
    );
  });
});
