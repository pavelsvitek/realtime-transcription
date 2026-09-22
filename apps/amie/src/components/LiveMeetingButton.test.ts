import { describe, expect, it } from "vitest";
import { liveMeetingButtonLabel } from "./LiveMeetingButton";

describe("liveMeetingButtonLabel", () => {
  it("uses Start a meeting when idle", () => {
    expect(liveMeetingButtonLabel(false, false)).toBe("Start a meeting");
  });

  it("uses Listening .. while a meeting is in progress", () => {
    expect(liveMeetingButtonLabel(true, false)).toBe("Listening ..");
  });

  it("keeps Listening .. even if the model is still loading", () => {
    expect(liveMeetingButtonLabel(true, true)).toBe("Listening ..");
  });

  it("uses Loading model... while starting", () => {
    expect(liveMeetingButtonLabel(false, true)).toBe("Loading model...");
  });
});
