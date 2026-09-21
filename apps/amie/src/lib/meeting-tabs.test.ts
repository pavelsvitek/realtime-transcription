import { describe, expect, it } from "vitest";
import {
  LIVE_TRANSCRIPT_TAB_LABEL,
  MEETING_TAB_ORDER,
  meetingTabDomIds,
} from "../components/MeetingTabs";

describe("MeetingTabs", () => {
  it("keeps Summary, Context, Transcript order on live and review pages", () => {
    expect(MEETING_TAB_ORDER).toEqual(["summary", "context", "transcript"]);
  });

  it("labels the live transcript tab as Transcript (live)", () => {
    expect(LIVE_TRANSCRIPT_TAB_LABEL).toBe("Transcript (live)");
  });

  it("shares tab/panel ids between the tablist and panels", () => {
    expect(meetingTabDomIds("transcribe", "transcript")).toEqual({
      tabId: "transcribe-tab-transcript",
      panelId: "transcribe-panel-transcript",
    });
  });
});
