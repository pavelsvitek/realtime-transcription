import { describe, expect, it } from "vitest";
import {
  downloadedMegabytes,
  microphoneStepState,
  previousWizardStep,
  totalMegabytes,
  wizardStepNumber,
} from "./setup-wizard";

const SIZE = 612 * 1024 * 1024;

describe("setup wizard steps", () => {
  it("numbers the model and microphone steps, not Welcome", () => {
    expect(wizardStepNumber("welcome")).toBeNull();
    expect(wizardStepNumber("model")).toBe(1);
    expect(wizardStepNumber("microphone")).toBe(2);
  });

  it("goes back one step at a time and stops at Welcome", () => {
    expect(previousWizardStep("microphone")).toBe("model");
    expect(previousWizardStep("model")).toBe("welcome");
    expect(previousWizardStep("welcome")).toBeNull();
  });
});

describe("downloadedMegabytes", () => {
  it("turns the percent into megabytes of the expected size", () => {
    expect(downloadedMegabytes(38, SIZE)).toBe(233);
    expect(downloadedMegabytes(0, SIZE)).toBe(0);
    expect(downloadedMegabytes(100, SIZE)).toBe(612);
  });

  it("clamps out-of-range percents", () => {
    expect(downloadedMegabytes(140, SIZE)).toBe(612);
    expect(downloadedMegabytes(-5, SIZE)).toBe(0);
  });

  it("reports the total size in megabytes", () => {
    expect(totalMegabytes(SIZE)).toBe(612);
  });
});

describe("microphoneStepState", () => {
  it("offers Continue once access is allowed", () => {
    expect(microphoneStepState("authorized")).toBe("allowed");
  });

  it("sends a refused or restricted mic to System Settings", () => {
    expect(microphoneStepState("denied")).toBe("denied");
    expect(microphoneStepState("restricted")).toBe("denied");
  });

  it("asks with the macOS prompt otherwise", () => {
    expect(microphoneStepState("notDetermined")).toBe("ask");
    expect(microphoneStepState("unknown")).toBe("ask");
    expect(microphoneStepState(null)).toBe("ask");
  });
});
