export type SpeakerId = "me" | "sam" | "maya" | "jordan";

export const SPEAKERS: Record<
  SpeakerId,
  { name: string; fullName: string; role: string; className: string }
> = {
  me: {
    name: "me",
    fullName: "me",
    role: "Local",
    className: "text-dark-text-primary",
  },
  sam: {
    name: "Sam",
    fullName: "Sam Rivera",
    role: "Product",
    className: "text-dark-speaker-user",
  },
  maya: {
    name: "Maya",
    fullName: "Maya Chen",
    role: "Engineering",
    className: "text-dark-speaker-remote",
  },
  jordan: {
    name: "Jordan",
    fullName: "Jordan Hale",
    role: "Design",
    className: "text-[#8EC8F0]",
  },
};

export type TranscriptLine = {
  time: string;
  speaker: SpeakerId;
  text: string;
  live?: boolean;
};

export const MEETING = {
  title: "Sprint planning",
  when: "Today",
};

export const TRANSCRIPT: TranscriptLine[] = [
  {
    time: "0:08",
    speaker: "maya",
    text: "So for this sprint, what’s actually in?",
  },
  {
    time: "0:15",
    speaker: "sam",
    text: "Local capture first. Cloud fallback can wait.",
  },
  {
    time: "0:22",
    speaker: "jordan",
    text: "Then freeze the transcript chrome so summaries stay readable.",
  },
  {
    time: "0:31",
    speaker: "maya",
    text: "Local is fine if latency holds. What’s median looking like?",
  },
  {
    time: "0:38",
    speaker: "sam",
    text: "Sure, median was around two hundred",
    live: true,
  },
];

export const LIVE_WORDS = [
  { word: "Sure,", opacity: 0.4 },
  { word: "median", opacity: 0.55 },
  { word: "was", opacity: 0.7 },
  { word: "around", opacity: 0.85 },
  { word: "two", opacity: 1 },
  { word: "hundr", opacity: 1, ink: true },
];

export const ROADMAP_MEETINGS = [
  {
    n: 1,
    title: "Q3 planning",
    when: "Mon 10:00",
  },
  {
    n: 2,
    title: MEETING.title,
    when: MEETING.when,
  },
] as const;

export const DECISIONS = [
  {
    time: "0:15",
    speaker: "sam" as SpeakerId,
    text: "Local capture first — cloud fallback waits.",
  },
  {
    time: "0:22",
    speaker: "jordan" as SpeakerId,
    text: "Freeze the transcript chrome so summaries stay readable.",
  },
  {
    time: "0:31",
    speaker: "maya" as SpeakerId,
    text: "Stay local if latency holds.",
  },
];

export const MCP_QUERIES = {
  findMeetings: "Find last 2 roadmap meetings",
  showDecisions: "Show all decisions from the 2nd meeting",
} as const;

export type SummaryInline = {
  thesis?: string;
  speaker?: SpeakerId;
  text: string;
};

export type SummaryBullet = SummaryInline & {
  children?: readonly SummaryInline[];
};

export const SUMMARY = {
  title: "Sprint planning — local capture first",
  when: MEETING.when,
  executive: [
    {
      thesis: "Local capture first:",
      speaker: "sam" as SpeakerId,
      text: "put local capture in this sprint. Cloud fallback waits.",
    },
    {
      thesis: "Transcript chrome freeze:",
      speaker: "jordan" as SpeakerId,
      text: "will freeze the transcript chrome so summaries stay readable.",
    },
    {
      thesis: "Latency gate:",
      speaker: "maya" as SpeakerId,
      text: "is fine staying local if latency holds, and asked what median looks like.",
    },
    {
      thesis: "Open:",
      speaker: "sam" as SpeakerId,
      text: "had started to answer median latency when the recording stopped.",
    },
    {
      thesis: "Next step: Confirm median latency so",
      speaker: "maya" as SpeakerId,
      text: "can hold the local-only cut.",
    },
  ],
  full: [
    {
      heading: "Scope this sprint",
      items: [
        {
          speaker: "sam" as SpeakerId,
          text: "on capture:",
          children: [
            { text: "Local capture is in for this sprint." },
            { text: "Cloud fallback waits for a later cut." },
          ],
        },
      ],
    },
    {
      heading: "Transcript chrome",
      items: [
        {
          speaker: "jordan" as SpeakerId,
          text: "owns freezing the transcript chrome:",
          children: [{ text: "Goal: summaries stay readable in export." }],
        },
      ],
    },
    {
      heading: "Latency",
      items: [
        {
          speaker: "maya" as SpeakerId,
          text: "holds the local-only decision if latency is acceptable.",
          children: [
            { text: "She asked for median." },
            {
              speaker: "sam" as SpeakerId,
              text: "had begun to answer when the recording stopped.",
            },
          ],
        },
      ],
    },
  ],
} as const;

export const settledLines = TRANSCRIPT.filter((line) => !line.live);
export const liveLine = TRANSCRIPT.find((line) => line.live)!;
