import { getModeDefinition } from "@/lib/session/modes";
import type {
    GenerateSuggestionsRequest,
    ItemDisposition,
    SessionMode,
    SuggestionItemState,
} from "@/lib/session/types";

const CARD_PURPOSES: Record<string, string> = {
  "follow-ups":
    "Short follow-up questions the interviewer should ask next to deepen understanding.",
  needs:
    "Customer needs, pain points, jobs-to-be-done, and unmet needs expressed or implied.",
  risks:
    "Risks, objections, blockers, trust concerns, and reasons the conversation might stall.",
  topics:
    "Themes worth exploring further that are not yet fully understood.",
};

const VISIBLE_DISPOSITIONS: ItemDisposition[] = ["active", "pinned", "done"];

function formatSessionContext(
  request: GenerateSuggestionsRequest,
): string {
  const ctx = request.sessionContext;
  if (!ctx) return "No additional session context provided.";

  const lines: string[] = [];
  if (ctx.goal) lines.push(`Interview goal: ${ctx.goal}`);
  if (ctx.participantSegment) {
    lines.push(`Participant segment: ${ctx.participantSegment}`);
  }
  if (ctx.hypothesis) lines.push(`Hypothesis: ${ctx.hypothesis}`);
  if (ctx.additionalContext) {
    lines.push(`Additional context: ${ctx.additionalContext}`);
  }

  return lines.length > 0 ? lines.join("\n") : "No additional session context provided.";
}

function formatItem(item: SuggestionItemState): string {
  return `- disposition=${item.disposition} id=${item.id}\n  text: ${item.text}\n  rationale: ${item.rationale}`;
}

function formatItemsByCard(
  request: GenerateSuggestionsRequest,
  filter: (item: SuggestionItemState) => boolean,
  emptyLabel: string,
): string {
  return request.cards
    .map((card) => {
      const filtered = card.items.filter(filter);
      if (filtered.length === 0) {
        return `### ${card.title} (${card.id})\n${emptyLabel}`;
      }

      return `### ${card.title} (${card.id})\n${filtered.map(formatItem).join("\n")}`;
    })
    .join("\n\n");
}

function formatVisibleItems(request: GenerateSuggestionsRequest): string {
  return formatItemsByCard(
    request,
    (item) => VISIBLE_DISPOSITIONS.includes(item.disposition),
    "(none)",
  );
}

function formatSuppressedItems(request: GenerateSuggestionsRequest): string {
  return formatItemsByCard(
    request,
    (item) => item.disposition === "discarded",
    "(none — no discarded topics on this card)",
  );
}

function formatTranscriptChunk(request: GenerateSuggestionsRequest): string {
  if (request.transcriptChunk.length === 0) {
    return "(no transcript in this window)";
  }

  return request.transcriptChunk
    .map((line) => `${line.speaker}: ${line.text}`)
    .join("\n");
}

export function buildSystemPrompt(mode: SessionMode): string {
  const modeDef = getModeDefinition(mode);
  const cardList = modeDef.cards
    .map((card) => `- **${card.id}** (${card.title}): ${CARD_PURPOSES[card.id] ?? card.title}`)
    .join("\n");

  return `You are a live conversation copilot for "${modeDef.label}" mode. You are NOT a chat assistant.

Your job is to analyze a recent transcript window and suggest short, actionable card items that help the user perform better during the live conversation.

## Card types
${cardList}

## Item state semantics
Each existing item has a disposition:
- active: visible on the card; do not duplicate or lightly rephrase
- pinned: user marked important; do not duplicate
- done: user acted on it; do not duplicate
- discarded: user rejected it for this conversation; treat as suppressed unless resurfacing rules apply

## Rules
1. Return ONLY genuinely new items. An empty items array is correct and preferred over noise.
2. Append-only: each item must open a new thread. Do not rephrase existing items.
3. Dedupe semantically against items (active, pinned, done, discarded) on the same card.
4. **Suppressed (discarded) items must NOT reappear** unless the transcript chunk contains substantial NEW evidence (new facts, direct quotes, or clear escalation). A passing mention of the same theme is not enough to resurface.
5. If a discarded topic might be resurfacing, the new item must be meaningfully different and the rationale must cite the new evidence explicitly.
6. Item text: one short actionable line (question, need, risk, or topic).
7. Rationale: 1-2 short sentences citing specific recent transcript context.
8. Assign each item to exactly one cardId from: ${modeDef.cards.map((c) => c.id).join(", ")}.
9. Maximum ${2} items per card per response.
10. Prefer silence when the signal is weak or already captured.
11. Keep item text under 120 characters and rationale under 200 characters.`;
}

export function buildUserPrompt(request: GenerateSuggestionsRequest): string {
  return `## Session context
${formatSessionContext(request)}

## Existing items by card (active, pinned, done)
Do not duplicate or lightly rephrase these.

${formatVisibleItems(request)}

## Suppressed topics by card (disposition=discarded)
The user dismissed these during the live session. Do not suggest them again unless the transcript chunk contains substantial new evidence.

${formatSuppressedItems(request)}

## Transcript chunk (last 90 seconds)
${formatTranscriptChunk(request)}`;
}

export const SUGGESTIONS_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cardId: { type: "string" },
          text: { type: "string", maxLength: 120 },
          rationale: { type: "string", maxLength: 200 },
        },
        required: ["cardId", "text", "rationale"],
      },
    },
  },
  required: ["items"],
} as const;
