export type ItemState = "visible" | "pinned" | "done";

export type SuggestionItem = {
  id: string;
  text: string;
  rationale: string;
  state?: ItemState;
};

export type SuggestionCard = {
  id: string;
  title: string;
  items: SuggestionItem[];
};

export type TranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  time: string;
};

export const SESSION_MODE = "Customer interview";

export const MOCK_CARDS: SuggestionCard[] = [
  {
    id: "follow-ups",
    title: "Follow-up questions",
    items: [
      {
        id: "fu-1",
        text: "Ask what workaround they used before and why it failed",
        rationale: "They mentioned reconstructing missed threads after the call.",
      },
      {
        id: "fu-2",
        text: "Probe how often the follow-up thread gets lost mid-interview",
        rationale: "Pain was specific to in-the-moment follow-ups, not note-taking alone.",
        state: "pinned",
      },
    ],
  },
  {
    id: "needs",
    title: "Customer needs",
    items: [
      {
        id: "need-1",
        text: "Fewer missed threads during the live forty-five minutes",
        rationale: "They prioritized in-call help over post-call synthesis features.",
      },
      {
        id: "need-2",
        text: "Low-noise suggestions they can trust without reading a chat stream",
        rationale: "Granola felt like too much text while trying to stay present on camera.",
      },
    ],
  },
  {
    id: "risks",
    title: "Risks or objections",
    items: [
      {
        id: "risk-1",
        text: "Suggestion churn could cause them to ignore the product",
        rationale: "Repeated ideas — like four pricing prompts — are worse than silence.",
      },
    ],
  },
  {
    id: "topics",
    title: "Topics to explore",
    items: [
      {
        id: "topic-1",
        text: "Custom modes and pre-session context",
        rationale: "They want hypothesis and segment context to shape card output.",
      },
      {
        id: "topic-2",
        text: "Privacy and cloud processing expectations",
        rationale: "Enterprise participants ask where audio goes; clarity is a deal breaker.",
      },
    ],
  },
];

export const MOCK_TRANSCRIPT: TranscriptSegment[] = [
  {
    id: "t-1",
    speaker: "Pavel",
    time: "09:15",
    text: "When it breaks down, what's the first thing you lose — the thread, the notes, or something else?",
  },
  {
    id: "t-2",
    speaker: "Morgan",
    time: "09:22",
    text: "The follow-up thread. Someone mentions a workaround they've used for months, I think I'll come back to it, the conversation moves on, and twenty minutes later I've lost the moment.",
  },
  {
    id: "t-3",
    speaker: "Morgan",
    time: "09:38",
    text: "After the call I skim Otter and find three questions I wish I'd asked while we were still talking.",
  },
  {
    id: "t-4",
    speaker: "Pavel",
    time: "09:52",
    text: "Let me describe what we're building and you can react. Main area is a stable two-by-two grid of cards — not a chat stream.",
  },
];
