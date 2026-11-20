import { describe, expect, it } from "vitest";
import {
  MEETING_TAB_ORDER,
  meetingTabDomIds,
  moveMeetingTab,
} from "../components/MeetingTabs";

describe("MeetingTabs", () => {
  it("keeps Summary, Context, Transcript order on live and review pages", () => {
    expect(MEETING_TAB_ORDER).toEqual(["transcript", "context", "summary"]);
  });

  it("moves between tabs and stops at both ends", () => {
    expect(moveMeetingTab("transcript", "right")).toBe("context");
    expect(moveMeetingTab("context", "right")).toBe("summary");
    expect(moveMeetingTab("summary", "right")).toBe("summary");
    expect(moveMeetingTab("summary", "left")).toBe("context");
    expect(moveMeetingTab("transcript", "left")).toBe("transcript");
  });

  it("skips locked tabs", () => {
    const locked = { summary: "After the call" };
    expect(moveMeetingTab("context", "right", locked)).toBe("context");
    expect(moveMeetingTab("transcript", "right", locked)).toBe("context");
  });

  it("shares tab/panel ids between the tablist and panels", () => {
    expect(meetingTabDomIds("transcribe", "transcript")).toEqual({
      tabId: "transcribe-tab-transcript",
      panelId: "transcribe-panel-transcript",
    });
  });
});
