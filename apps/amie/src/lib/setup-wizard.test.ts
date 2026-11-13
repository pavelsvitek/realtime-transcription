import { beforeEach, describe, expect, it } from "vitest";
import {
  downloadedMegabytes,
  isOptionalStep,
  loadSystemAudioTest,
  saveSystemAudioTest,
  unfinishedRows,
  microphoneStepState,
  nextWizardStep,
  previousWizardStep,
  stepAfter,
  readyRows,
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

describe("system audio test memory", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });

  it("starts with no result and remembers the last one", () => {
    expect(loadSystemAudioTest()).toBeNull();
    saveSystemAudioTest("silent");
    expect(loadSystemAudioTest()).toBe("silent");
    saveSystemAudioTest("heard");
    expect(loadSystemAudioTest()).toBe("heard");
    saveSystemAudioTest(null);
    expect(loadSystemAudioTest()).toBeNull();
  });

  it("ignores values it did not write", () => {
    localStorage.setItem("amie-system-audio-test", "maybe");
    expect(loadSystemAudioTest()).toBeNull();
  });

  it("returns null when storage is unavailable", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    expect(loadSystemAudioTest()).toBeNull();
    expect(() => saveSystemAudioTest("heard")).not.toThrow();
  });
});

describe("unfinishedRows", () => {
  it("lists only what is left", () => {
    const rows = [
      { label: "Speech model", done: true, step: "model" as const },
      { label: "Speaker names", done: false, step: "speakers" as const },
    ];
    expect(unfinishedRows(rows).map((row) => row.label)).toEqual(["Speaker names"]);
  });
});
