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
  context: string | null;
};

export type MeetingSegment = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  /** Display name from the meeting app, or "User" / "Remote". Empty on older rows. */
  speaker: string;
  /** "mic" or "system". Empty when the row was saved before this was stored. */
  stream: string;
};

export type MeetingRecord = {
  meeting: MeetingDetail;
  segments: MeetingSegment[];
};

/** Optional Meeting fields. Only include keys that should change. */
export type MeetingPatch = {
  title?: string;
  context?: string | null;
  summary?: string | null;
  archivedAt?: number;
};

/** Context and summary taken from a finished meeting to start a follow-up. */
export type FollowUpSeed = {
  context: string | null;
  summary: string | null;
};

export function followUpSeedFromMeeting(
  meeting: { context: string | null; summary: string | null },
  draft = "",
): FollowUpSeed {
  const summary = meeting.summary?.trim()
    ? meeting.summary
    : draft.trim()
      ? draft
      : null;
  const context = meeting.context?.trim() ? meeting.context : null;
  return { context, summary };
}

export function followUpContextFromSeed(seed: FollowUpSeed): string | null {
  const summary = seed.summary?.trim() ?? "";
  const context = seed.context?.trim() ?? "";
  const summarySection = summary
    ? `## Previous meeting summary\n${summary}`
    : "";
  if (context && summarySection) return `${context}\n\n${summarySection}`;
  if (context) return context;
  if (summarySection) return summarySection;
  return null;
}

export function followUpMeetingPatch(seed: FollowUpSeed): MeetingPatch {
  const context = followUpContextFromSeed(seed);
  return context ? { context } : {};
}

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
  // Only a single ATX `# ` heading is a title. `##` / `###` belong in the summary.
  if (/^#\s+/.test(stripped) && !stripped.startsWith("##")) {
    return stripped.replace(/^#\s+/, "");
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

/** Automatic summaries wait until the meeting has lasted this long. */
export const AUTO_SUMMARY_MIN_MS = 5 * 60 * 1000;

/** Meetings shorter than 5 minutes are not summarized until the user asks. */
export function meetingSkipsAutoSummary(startedAt: number, finishedAt: number): boolean {
  return finishedAt - startedAt < AUTO_SUMMARY_MIN_MS;
}

/** "45-mins meeting at 2pm" — start time rounded to the nearest 15 minutes. */
export function finishedMeetingTitle(startedAt: number, finishedAt: number): string {
  const elapsedMs = Math.max(0, finishedAt - startedAt);
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  return `${minutes}-mins meeting at ${formatQuarterHour(startedAt)}`;
}

function formatQuarterHour(timestamp: number): string {
  const rounded = roundToQuarterHour(new Date(timestamp));
  const hours24 = rounded.getHours();
  const minute = rounded.getMinutes();
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 || 12;
  if (minute === 0) {
    return `${hours12}${suffix}`;
  }
  return `${hours12}:${String(minute).padStart(2, "0")}${suffix}`;
}

function roundToQuarterHour(date: Date): Date {
  const rounded = new Date(date);
  const fraction =
    date.getMinutes() + date.getSeconds() / 60 + date.getMilliseconds() / 60_000;
  const nearest = Math.round(fraction / 15) * 15;
  rounded.setSeconds(0, 0);
  rounded.setMinutes(nearest);
  return rounded;
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
