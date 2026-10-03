export const ROSE = "#ce5b78";

export const DOWNLOAD_HREF = "#download";

export const FINE_PRINT =
  "macOS 13+ · Apple silicon · on-device SQLite. Download is a placeholder until a release URL exists.";

export const BEATS = [
  {
    key: "Start",
    title: "Start",
    body: "⌘N starts a meeting. Nothing joins the call.",
  },
  {
    key: "Listen",
    title: "Listen",
    body: "Mic + system audio. You are User; they are Remote.",
  },
  {
    key: "Keep",
    title: "Keep",
    body: "Transcript and summary stay on this Mac.",
  },
] as const;

export const DEMO_NAMED_LINES = [
  {
    time: "00:12",
    speaker: "You",
    stream: "mic" as const,
    text: "Let’s walk the hiring plan before Friday.",
  },
  {
    time: "00:18",
    speaker: "Alex Chen",
    stream: "sys" as const,
    text: "We still need a designer who can sit with the Mac app.",
  },
  {
    time: "00:29",
    speaker: "You",
    stream: "mic" as const,
    text: "Amie is capturing this, so we don’t take notes in the call.",
  },
  {
    time: "00:36",
    speaker: "Alex Chen",
    stream: "sys" as const,
    text: "Good. No bot to explain to the candidate.",
  },
  {
    time: "00:44",
    speaker: "You",
    stream: "mic" as const,
    text: "We’ll leave with a transcript and a summary on disk.",
  },
];

export const DEMO_LINES = [
  {
    time: "00:12",
    speaker: "User" as const,
    stream: "mic" as const,
    text: "Let’s walk the hiring plan before Friday.",
  },
  {
    time: "00:18",
    speaker: "Remote" as const,
    stream: "sys" as const,
    text: "We still need a designer who can sit with the Mac app.",
  },
  {
    time: "00:29",
    speaker: "User" as const,
    stream: "mic" as const,
    text: "Amie is capturing this, so we don’t take notes in the call.",
  },
  {
    time: "00:36",
    speaker: "Remote" as const,
    stream: "sys" as const,
    text: "Good. No bot to explain to the candidate.",
  },
  {
    time: "00:44",
    speaker: "User" as const,
    stream: "mic" as const,
    text: "We’ll leave with a transcript and a summary on disk.",
  },
];

export const DEMO_SUMMARY = `Hiring plan before Friday. Need a Mac-native designer. Capture stays on this Mac — no meeting bot in the call.`;

export const DEMO_CONTEXT = `Participants: Alex Chen, Jordan Blake
Topic: Q3 hiring for the Mac app
Keep the candidate off the record from third-party bots.`;

export const DEMO_MEETINGS = [
  { when: "Today", title: "Hiring plan", duration: "24 min" },
  { when: "Yesterday", title: "Design critique", duration: "41 min" },
  { when: "Tue", title: "Customer interview", duration: "58 min" },
];

export const STORE_PATH = "~/Library/Application Support/com.pavel.amie/";

export const VARIANTS = [
  {
    href: "/landing/notepad",
    slug: "notepad",
    title: "Notepad",
    story: "The notepad for Zoom, Meet, and Teams.",
  },
  {
    href: "/landing/shortcut",
    slug: "shortcut",
    title: "Shortcut",
    story: "Start a meeting with ⌘N.",
  },
  {
    href: "/landing/trust",
    slug: "trust",
    title: "Trust",
    story: "Your meetings stay on this Mac.",
  },
  {
    href: "/landing/craft",
    slug: "craft",
    title: "Craft",
    story: "Meetings, transcribed on your Mac.",
  },
  {
    href: "/landing/live",
    slug: "live",
    title: "Live",
    story: "User / Remote, as it happens.",
  },
] as const;
