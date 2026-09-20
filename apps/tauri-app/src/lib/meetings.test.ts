import { describe, expect, it } from "vitest";
import {
  commitMeetingTitle,
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
