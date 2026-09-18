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

export type MeetingDayGroup = {
  key: string;
  label: string;
  meetings: MeetingListItem[];
};

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
