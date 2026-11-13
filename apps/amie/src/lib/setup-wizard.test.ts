import { describe, expect, it } from "vitest";
import {
  downloadedMegabytes,
  isOptionalStep,
  microphoneStepState,
  nextWizardStep,
  previousWizardStep,
  stepAfter,
  readyRows,
  showsBackgroundModelStatus,
  summaryProviderLabel,
  totalMegabytes,
  wizardStepNumber,
} from "./setup-wizard";

const SIZE = 612 * 1024 * 1024;

describe("setup wizard steps", () => {
  it("numbers the five setup steps, not Welcome or Ready", () => {
    expect(wizardStepNumber("welcome")).toBeNull();
    expect(wizardStepNumber("model")).toBe(1);
    expect(wizardStepNumber("microphone")).toBe(2);
    expect(wizardStepNumber("systemAudio")).toBe(3);
    expect(wizardStepNumber("summaries")).toBe(4);
    expect(wizardStepNumber("speakers")).toBe(5);
    expect(wizardStepNumber("ready")).toBeNull();
  });

  it("walks forward to Ready and stops there", () => {
    expect(nextWizardStep("welcome")).toBe("model");
    expect(nextWizardStep("speakers")).toBe("ready");
    expect(nextWizardStep("ready")).toBeNull();
  });

  it("returns to Ready after a step opened from the recap", () => {
    expect(stepAfter("systemAudio", true)).toBe("ready");
    expect(stepAfter("model", true)).toBe("ready");
    expect(stepAfter("systemAudio", false)).toBe("summaries");
    expect(stepAfter("welcome", true)).toBe("model");
  });

  it("goes back one step, with no Back on Welcome or Ready", () => {
    expect(previousWizardStep("microphone")).toBe("model");
    expect(previousWizardStep("model")).toBe("welcome");
    expect(previousWizardStep("welcome")).toBeNull();
    expect(previousWizardStep("ready")).toBeNull();
  });

  it("marks summaries and speaker names as optional", () => {
    expect(isOptionalStep("summaries")).toBe(true);
    expect(isOptionalStep("speakers")).toBe(true);
    expect(isOptionalStep("systemAudio")).toBe(false);
  });

  it("shows the background model bar from the microphone step to speaker names", () => {
    expect(showsBackgroundModelStatus("model")).toBe(false);
    expect(showsBackgroundModelStatus("microphone")).toBe(true);
    expect(showsBackgroundModelStatus("speakers")).toBe(true);
    expect(showsBackgroundModelStatus("ready")).toBe(false);
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

describe("summaryProviderLabel", () => {
  it("names known providers and nothing else", () => {
    expect(summaryProviderLabel("xai")).toBe("xAI");
    expect(summaryProviderLabel("gemini")).toBe("Gemini");
    expect(summaryProviderLabel("other")).toBe("");
    expect(summaryProviderLabel(null)).toBe("");
  });
});

describe("readyRows", () => {
  const allDone = {
    modelReady: true,
    modelDownloading: false,
    microphoneAllowed: true,
    systemAudio: "heard" as const,
    summaryProvider: "xai" as const,
    providerKeys: { xai: true, openai: false, gemini: false },
    accessibilityAllowed: true,
    meetConnected: false,
  };

  it("matches the design when only Google Meet is left", () => {
    const rows = readyRows(allDone);
    expect(rows.map((row) => [row.label, row.done, row.detail])).toEqual([
      ["Speech model", true, undefined],
      ["Microphone", true, undefined],
      ["System audio", true, "tested"],
      ["Summaries", true, "xAI"],
      ["Speaker names", true, "Zoom & Teams"],
      ["Google Meet speaker names", false, "not connected"],
    ]);
  });

  it("leaves skipped steps to finish later and points back at them", () => {
    const rows = readyRows({
      ...allDone,
      modelReady: false,
      modelDownloading: true,
      systemAudio: null,
      summaryProvider: "openai",
      accessibilityAllowed: false,
    });
    const byLabel = Object.fromEntries(rows.map((row) => [row.label, row]));
    expect(byLabel["Speech model"]).toMatchObject({ done: false, detail: "downloading" });
    expect(byLabel["System audio"]).toMatchObject({ done: false, step: "systemAudio" });
    expect(byLabel["Summaries"]).toMatchObject({ done: false, step: "summaries" });
    expect(byLabel["Speaker names"]).toMatchObject({ done: false, step: "speakers" });
    expect(byLabel["Google Meet speaker names"]).toMatchObject({ done: false, step: "speakers" });
  });

  it("counts a failed sound test as not done", () => {
    const rows = readyRows({ ...allDone, systemAudio: "silent" });
    expect(rows.find((row) => row.label === "System audio")?.done).toBe(false);
  });
});
