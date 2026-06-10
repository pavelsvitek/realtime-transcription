import type { SessionMode } from "./types";

export type CardDefinition = {
  id: string;
  title: string;
};

export type ModeDefinition = {
  id: SessionMode;
  label: string;
  cards: CardDefinition[];
};

export const CUSTOMER_INTERVIEW_MODE: ModeDefinition = {
  id: "customer_interview",
  label: "Customer interview",
  cards: [
    { id: "follow-ups", title: "Follow-up questions" },
    { id: "needs", title: "Customer needs" },
    { id: "risks", title: "Risks or objections" },
    { id: "topics", title: "Topics to explore" },
  ],
};

const MODES: Record<SessionMode, ModeDefinition> = {
  customer_interview: CUSTOMER_INTERVIEW_MODE,
};

export function getModeDefinition(mode: SessionMode): ModeDefinition {
  return MODES[mode];
}
