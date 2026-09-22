import { describe, expect, it } from "vitest";
import {
  commitMeetingTitle,
  finishedMeetingTitle,
  followUpMeetingPatch,
  followUpSeedFromMeeting,
  meetingSkipsAutoSummary,
  formatMeetingDayLabel,
  groupMeetingsByDay,
  parseMeetingLlmOutput,
} from "./meetings";
import type { MeetingListItem } from "./meetings";

function item(id: string, startedAt: number, title: string): MeetingListItem {
  return { id, startedAt, title, teaser: null };
}

describe("groupMeetingsByDay", () => {
  it("keeps newest-first order and groups consecutive same-day rows", () => {
    const fridayMorning = Date.UTC(2026, 8, 4, 8, 33);
    const fridayAfternoon = Date.UTC(2026, 8, 4, 13, 33);
    const wednesday = Date.UTC(2026, 8, 2, 13, 4);

    const groups = groupMeetingsByDay([
      item("a", fridayAfternoon, "POC"),
      item("b", fridayMorning, "Review"),
      item("c", wednesday, "Designs"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.meetings.map((m) => m.id)).toEqual(["a", "b"]);
    expect(groups[1]?.meetings.map((m) => m.id)).toEqual(["c"]);
  });

  it("formats list headers like the mock", () => {
    const local = new Date(2026, 8, 4, 15, 33);
    expect(formatMeetingDayLabel(local.getTime())).toBe("Sep 4 / Friday");
  });
});

describe("meetingSkipsAutoSummary", () => {
  it("skips automatic summary only when the meeting is shorter than 5 minutes", () => {
    const start = 1_000;
    expect(meetingSkipsAutoSummary(start, start + 5 * 60_000 - 1)).toBe(true);
    expect(meetingSkipsAutoSummary(start, start + 5 * 60_000)).toBe(false);
    expect(meetingSkipsAutoSummary(start, start + 12 * 60_000)).toBe(false);
  });
});

describe("finishedMeetingTitle", () => {
  const at = (hours: number, minutes: number, seconds = 0) =>
    new Date(2026, 8, 21, hours, minutes, seconds).getTime();

  it("rounds the start time to 15-minute marks and counts minutes", () => {
    const start = at(14, 7);
    const end = start + 45 * 60_000;
    expect(finishedMeetingTitle(start, end)).toBe("45-mins meeting at 2pm");
  });

  it("uses :15 and :30 when the start is closer to those marks", () => {
    expect(finishedMeetingTitle(at(14, 8), at(14, 20))).toBe(
      "12-mins meeting at 2:15pm",
    );
    expect(finishedMeetingTitle(at(14, 22), at(14, 52))).toBe(
      "30-mins meeting at 2:15pm",
    );
    expect(finishedMeetingTitle(at(14, 23), at(15, 8))).toBe(
      "45-mins meeting at 2:30pm",
    );
  });

  it("rolls an hour and uses 12-hour am/pm", () => {
    expect(finishedMeetingTitle(at(14, 53), at(15, 10))).toBe(
      "17-mins meeting at 3pm",
    );
    expect(finishedMeetingTitle(at(0, 7), at(0, 20))).toBe(
      "13-mins meeting at 12am",
    );
    expect(finishedMeetingTitle(at(12, 8), at(12, 20))).toBe(
      "12-mins meeting at 12:15pm",
    );
    expect(finishedMeetingTitle(at(23, 53), at(23, 58))).toBe(
      "5-mins meeting at 12am",
    );
  });

  it("rounds a short meeting up to 1 minute", () => {
    expect(finishedMeetingTitle(at(9, 0), at(9, 0, 20))).toBe(
      "1-mins meeting at 9am",
    );
  });
});

describe("commitMeetingTitle", () => {
  it("trims and keeps typed text", () => {
    expect(commitMeetingTitle("  Weekly sync  ")).toBe("Weekly sync");
  });

  it("replaces a blank draft with Untitled meeting", () => {
    expect(commitMeetingTitle("   ")).toBe("Untitled meeting");
  });
});

describe("parseMeetingLlmOutput", () => {
  it("splits Title: from bullets", () => {
    expect(
      parseMeetingLlmOutput("Title: UBS FA UI mocks\n\n- **Attest** every entry\n")
    ).toEqual({
      title: "UBS FA UI mocks",
      summary: "- **Attest** every entry",
    });
  });

  it("keeps bullet-only output as the summary", () => {
    expect(parseMeetingLlmOutput("- **Ship** the API\n- Next steps")).toEqual({
      title: null,
      summary: "- **Ship** the API\n- Next steps",
    });
  });

  it("does not treat ## section headings as a title", () => {
    const markdown = "## Executive Summary\n\n- **Ship** the API";
    expect(parseMeetingLlmOutput(markdown)).toEqual({
      title: null,
      summary: markdown,
    });
  });
});

describe("followUpSeedFromMeeting", () => {
  it("copies trimmed context and summary", () => {
    expect(
      followUpSeedFromMeeting({
        context: "  Pavel  ",
        summary: "  Ship it  ",
      }),
    ).toEqual({ context: "  Pavel  ", summary: "  Ship it  " });
  });

  it("falls back to a summary draft when none is saved yet", () => {
    expect(
      followUpSeedFromMeeting({ context: null, summary: null }, "  Notes  "),
    ).toEqual({ context: null, summary: "  Notes  " });
  });

  it("treats blank strings as missing", () => {
    expect(
      followUpSeedFromMeeting({ context: "  \n", summary: "" }, "   "),
    ).toEqual({ context: null, summary: null });
  });
});

describe("followUpMeetingPatch", () => {
  it("omits empty fields so a new live meeting stays blank", () => {
    expect(followUpMeetingPatch({ context: null, summary: "  " })).toEqual({});
  });

  it("writes previous context then a markdown summary section", () => {
    expect(
      followUpMeetingPatch({ context: "Pavel", summary: "Ship it" }),
    ).toEqual({
      context: "Pavel\n\n## Previous meeting summary\nShip it",
    });
  });

  it("uses whichever of summary or context is present", () => {
    expect(followUpMeetingPatch({ context: "Pavel", summary: null })).toEqual({
      context: "Pavel",
    });
    expect(followUpMeetingPatch({ context: null, summary: "Ship it" })).toEqual({
      context: "## Previous meeting summary\nShip it",
    });
  });
});
