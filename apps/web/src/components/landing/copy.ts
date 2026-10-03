export const ROSE = "#ce5b78";

export const DOWNLOAD_HREF = "#download";

export const FINE_PRINT =
  "macOS 13+ · Apple silicon · on-device SQLite. Download is a placeholder until a release URL exists.";

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

export const DEMO_SUMMARY = `## Executive Summary

- **Hire a Mac-native designer before Friday.** **Alex Chen** said the Mac app still has no one who can sit with the product day to day.
- **No meeting bot on candidate calls.** The room agreed a third-party notetaker would leak the search and force an explanation in the interview.
- **Jordan Blake** stays off the record for this search until an offer is out.
- _Amie_ capture stays on this Mac — transcript and summary write to disk when the call ends.
- **Next step:** **You** send the designer brief to **Alex Chen** by Thursday; shortlist Friday.

## Full Summary

### Designer role

- **Alex Chen** needs someone who can sit with the Mac app, not a web-only hire.
    - Friday is the hard stop for the Q3 plan.
    - The brief should name _Amie_ and the desktop stack, not a generic product-design role.

### Privacy on the search

- The candidate must not see a bot in Zoom or Teams.
- Notes stay on this Mac so the search does not leave the room.

### Next steps

- **You:** designer brief to **Alex Chen** by Thursday.
- **Alex Chen:** three names before Friday.
- Sync again once the shortlist is in.`;

export const DEMO_CONTEXT = `Participants: Alex Chen, Jordan Blake
Topic: Q3 hiring for the Mac app
Keep the candidate off the record from third-party bots.`;

export const DEMO_FOLLOW_UP_CONTEXT = `${DEMO_CONTEXT}

## Previous meeting summary
${DEMO_SUMMARY}`;

export const DEMO_MEETINGS = [
  { when: "Today", title: "Hiring plan", duration: "24 min" },
  { when: "Yesterday", title: "Design critique", duration: "41 min" },
  { when: "Tue", title: "Customer interview", duration: "58 min" },
];

export const STORE_PATH = "~/Library/Application Support/com.pavel.amie/";
