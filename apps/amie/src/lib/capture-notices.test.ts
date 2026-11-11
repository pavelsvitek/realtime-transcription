import { describe, expect, it } from "vitest";
import {
  addCaptureNotice,
  clearSilenceOnSound,
  silenceSourceOf,
  type CaptureNotice,
} from "./capture-notices";

const MIC =
  "Microphone is silent. Open System Settings → Privacy & Security → Microphone and enable Amie, then Stop and Start again. The mic icon should turn red when you talk.";
const SYSTEM =
  "System audio capture is silent. Open System Settings → Privacy & Security and allow system audio recording for Amie, then restart.";
const OTHER = "ASR error: model failed";

describe("addCaptureNotice", () => {
  it("keeps the mic warning when the system-audio warning arrives", () => {
    const micOnly = addCaptureNotice([], new Set(), new Set(), MIC);
    const both = addCaptureNotice(micOnly, new Set(), new Set(), SYSTEM);
    expect(both.map((notice) => notice.message)).toEqual([MIC, SYSTEM]);
  });

  it("ignores a repeated warning and a blank message", () => {
    const once = addCaptureNotice([], new Set(), new Set(), MIC);
    expect(addCaptureNotice(once, new Set(), new Set(), MIC)).toBe(once);
    expect(addCaptureNotice(once, new Set(), new Set(), "  ")).toBe(once);
    expect(addCaptureNotice(once, new Set(), new Set(), null)).toBe(once);
  });

  it("does not bring back a warning the user closed", () => {
    const open: CaptureNotice[] = [{ id: SYSTEM, message: SYSTEM }];
    const dismissed = new Set([MIC]);
    expect(addCaptureNotice(open, dismissed, new Set(), MIC)).toBe(open);
  });

  it("does not show a silence warning after that source has already made sound", () => {
    const heard = new Set<"mic" | "system">(["mic"]);
    const open = addCaptureNotice([], new Set(), heard, SYSTEM);
    expect(addCaptureNotice(open, new Set(), heard, MIC)).toBe(open);
    expect(open.map((notice) => notice.message)).toEqual([SYSTEM]);
  });
});

describe("clearSilenceOnSound", () => {
  const both: CaptureNotice[] = [
    { id: MIC, message: MIC },
    { id: SYSTEM, message: SYSTEM },
    { id: OTHER, message: OTHER },
  ];

  it("hides only the mic banner when the microphone has sound", () => {
    const dismissed = new Set<string>();
    const heard = new Set<"mic" | "system">();
    const next = clearSilenceOnSound(both, dismissed, heard, "mic");
    expect(next.map((notice) => notice.message)).toEqual([SYSTEM, OTHER]);
    expect(dismissed.has(MIC)).toBe(true);
    expect(heard.has("mic")).toBe(true);
    expect(addCaptureNotice(next, dismissed, heard, MIC)).toBe(next);
  });

  it("hides only the system banner when system audio has sound", () => {
    const dismissed = new Set<string>();
    const heard = new Set<"mic" | "system">();
    const next = clearSilenceOnSound(both, dismissed, heard, "system");
    expect(next.map((notice) => notice.message)).toEqual([MIC, OTHER]);
    expect(dismissed.has(SYSTEM)).toBe(true);
    expect(heard.has("system")).toBe(true);
    expect(silenceSourceOf(MIC)).toBe("mic");
    expect(silenceSourceOf(OTHER)).toBeNull();
  });

  it("leaves the list alone when that source has no silence banner", () => {
    const micOnly: CaptureNotice[] = [{ id: MIC, message: MIC }];
    const dismissed = new Set<string>();
    const heard = new Set<"mic" | "system">();
    expect(clearSilenceOnSound(micOnly, dismissed, heard, "system")).toBe(micOnly);
    expect(heard.has("system")).toBe(true);
  });
});
