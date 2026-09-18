export type MeetingListItem = {
  id: string;
  startedAt: number;
  title: string;
  teaser: string | null;
};

export type MeetingDetail = {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  title: string;
  teaser: string | null;
  summary: string | null;
  status: string;
};

export type MeetingSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
};

export type MeetingRecord = {
  meeting: MeetingDetail;
  segments: MeetingSegment[];
};

export type SummaryJobState = "idle" | "running" | "done" | "error";

export type SummaryJobSnapshot = {
  state: SummaryJobState;
  draft: string;
  title?: string;
  error?: string;
};

export type SummaryDeltaPayload = {
  meetingId: string;
  text: string;
  title?: string;
};

export type SummaryStatusPayload = {
  meetingId: string;
  state: "running" | "done" | "error";
  error?: string;
};

export type MeetingDayGroup = {
  key: string;
  label: string;
  meetings: MeetingListItem[];
};

export const DEFAULT_MEETING_TITLE = "Untitled meeting";

export function commitMeetingTitle(draft: string): string {
  const trimmed = draft.trim();
  return trimmed.length === 0 ? DEFAULT_MEETING_TITLE : trimmed;
}

export function parseMeetingLlmOutput(raw: string): {
  title: string | null;
  summary: string;
} {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const firstIdx = lines.findIndex((line) => line.trim().length > 0);
  if (firstIdx === -1) {
    return { title: null, summary: "" };
  }

  const rawTitle = rawTitleFromLine(lines[firstIdx] ?? "");
  if (rawTitle !== null) {
    return {
      title: sanitizeGeneratedTitle(rawTitle),
      summary: lines.slice(firstIdx + 1).join("\n").trim(),
    };
  }

  return { title: null, summary: raw.trim() };
}

function rawTitleFromLine(line: string): string | null {
  const stripped = line.trim().replace(/\*\*/g, "");
  const titlePrefix = /^title:\s*/i;
  if (titlePrefix.test(stripped)) {
    return stripped.replace(titlePrefix, "");
  }
  if (stripped.startsWith("#") && !stripped.trimStart().slice(1).trim().startsWith("-")) {
    return stripped.replace(/^#+\s*/, "");
  }
  return null;
}

function sanitizeGeneratedTitle(raw: string): string | null {
  const collapsed = raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .split(/\s+/)
    .join(" ")
    .replace(/\.+$/, "")
    .trim();
  if (collapsed.length < 3) return null;
  const lower = collapsed.toLowerCase();
  if (
    lower === "untitled" ||
    lower === "untitled meeting" ||
    lower === "meeting" ||
    lower === "meeting notes" ||
    lower === "summary" ||
    lower === "executive summary"
  ) {
    return null;
  }
  return collapsed.slice(0, 80);
}

export function formatMeetingClock(startedAt: number): string {
  return new Date(startedAt).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatMeetingDayLabel(startedAt: number): string {
  const date = new Date(startedAt);
  const month = date.toLocaleString("en-US", { month: "short" });
  const weekday = date.toLocaleString("en-US", { weekday: "long" });
  return `${month} ${date.getDate()} / ${weekday}`;
}

export function formatMeetingDetailWhen(startedAt: number): string {
  const date = new Date(startedAt);
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()} at ${formatMeetingClock(startedAt)}`;
}

export function groupMeetingsByDay(meetings: MeetingListItem[]): MeetingDayGroup[] {
  const groups: MeetingDayGroup[] = [];

  for (const meeting of meetings) {
    const date = new Date(meeting.startedAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.meetings.push(meeting);
    } else {
      groups.push({
        key,
        label: formatMeetingDayLabel(meeting.startedAt),
        meetings: [meeting],
      });
    }
  }

  return groups;
}
