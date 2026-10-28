import { describe, expect, it } from "vitest";
import { micIndicatorState } from "./mic-indicator";

const base = { isActive: true, micActive: false, micMuted: false, error: null };

describe("micIndicatorState", () => {
  it("is idle until sound arrives and red while recording", () => {
    expect(micIndicatorState(base)).toBe("idle");
    expect(micIndicatorState({ ...base, micActive: true })).toBe("recording");
  });

  it("shows muted during a session, ahead of the recording look", () => {
    expect(micIndicatorState({ ...base, micMuted: true })).toBe("muted");
    expect(micIndicatorState({ ...base, micMuted: true, micActive: true })).toBe("muted");
  });

  it("ignores a stale muted flag when no session is running", () => {
    expect(micIndicatorState({ ...base, isActive: false, micMuted: true })).toBe("idle");
  });

  it("lets a real error win over muted", () => {
    expect(micIndicatorState({ ...base, micMuted: true, error: "boom" })).toBe("error");
  });
});
