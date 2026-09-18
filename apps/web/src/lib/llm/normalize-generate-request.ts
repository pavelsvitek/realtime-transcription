import type {
  GenerateSuggestionsRequest,
  ItemDisposition,
  SessionMode,
  SuggestionItemState,
} from "@/lib/session/types";

const VALID_DISPOSITIONS: ItemDisposition[] = [
  "active",
  "pinned",
  "done",
  "discarded",
];

function isItemDisposition(value: unknown): value is ItemDisposition {
  return (
    typeof value === "string" &&
    VALID_DISPOSITIONS.includes(value as ItemDisposition)
  );
}

function normalizeItem(raw: unknown): SuggestionItemState | null {
  if (!raw || typeof raw !== "object") return null;

  const item = raw as Partial<SuggestionItemState>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const text = typeof item.text === "string" ? item.text.trim() : "";
  const rationale =
    typeof item.rationale === "string" ? item.rationale.trim() : "";
  const disposition = isItemDisposition(item.disposition)
    ? item.disposition
    : "active";

  if (!id || !text) return null;

  return {
    id,
    text,
    rationale,
    disposition,
  };
}

export function normalizeGenerateRequest(
  body: unknown,
  validModes: SessionMode[],
): GenerateSuggestionsRequest | null {
  if (!body || typeof body !== "object") return null;

  const raw = body as Partial<GenerateSuggestionsRequest>;
  if (!raw.mode || !validModes.includes(raw.mode)) return null;
  if (!Array.isArray(raw.cards) || !Array.isArray(raw.transcriptChunk)) {
    return null;
  }

  const cards = raw.cards
    .map((card) => {
      if (!card || typeof card !== "object") return null;
      const id = typeof card.id === "string" ? card.id.trim() : "";
      const title = typeof card.title === "string" ? card.title.trim() : "";
      if (!id) return null;

      const items = Array.isArray(card.items)
        ? card.items
            .map(normalizeItem)
            .filter((item): item is SuggestionItemState => item !== null)
        : [];

      return { id, title: title || id, items };
    })
    .filter((card): card is NonNullable<typeof card> => card !== null);

  const transcriptChunk = raw.transcriptChunk
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const speaker = typeof line.speaker === "string" ? line.speaker.trim() : "";
      const text = typeof line.text === "string" ? line.text.trim() : "";
      const atMs = typeof line.atMs === "number" ? line.atMs : 0;
      if (!speaker || !text) return null;
      return { speaker, text, atMs };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  return {
    mode: raw.mode,
    sessionContext: raw.sessionContext,
    cards,
    transcriptChunk,
  };
}

export function summarizeItemStates(request: GenerateSuggestionsRequest): Record<
  ItemDisposition,
  number
> {
  const counts: Record<ItemDisposition, number> = {
    active: 0,
    pinned: 0,
    done: 0,
    discarded: 0,
  };

  for (const card of request.cards) {
    for (const item of card.items) {
      counts[item.disposition] += 1;
    }
  }

  return counts;
}
