import { describe, expect, it } from "vitest";
import {
  MEETING_TAB_ORDER,
  meetingTabDomIds,
} from "../components/MeetingTabs";

describe("MeetingTabs", () => {
  it("keeps Summary, Context, Transcript order on live and review pages", () => {
    expect(MEETING_TAB_ORDER).toEqual(["summary", "context", "transcript"]);
  });

  it("shares tab/panel ids between the tablist and panels", () => {
    expect(meetingTabDomIds("transcribe", "transcript")).toEqual({
      tabId: "transcribe-tab-transcript",
      panelId: "transcribe-panel-transcript",
    });
  });
});
