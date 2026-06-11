import { getModeDefinition } from "@/lib/session/modes";
import type {
  GeneratedSuggestion,
  GenerateSuggestionsRequest,
  ItemDisposition,
} from "@/lib/session/types";
import {
  MAX_ITEMS_PER_CALL,
  MAX_ITEMS_PER_CARD_PER_CALL,
} from "./constants";
import { normalizeSuggestionText } from "./normalize-text";

type RawResponse = {
  items?: Array<{
    cardId?: string;
    text?: string;
    rationale?: string;
  }>;
};

function isNearDuplicate(a: string, b: string): boolean {
  const na = normalizeSuggestionText(a);
  const nb = normalizeSuggestionText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    const longer = Math.max(na.length, nb.length);
    return shorter / longer >= 0.7;
  }
  return false;
}

function itemsWithDisposition(
  request: GenerateSuggestionsRequest,
  cardId: string,
  dispositions: ItemDisposition[],
) {
  const card = request.cards.find((c) => c.id === cardId);
  if (!card) return [];
  return card.items.filter((item) => dispositions.includes(item.disposition));
}

export function validateSuggestionsResponse(
  raw: unknown,
  request: GenerateSuggestionsRequest,
): GeneratedSuggestion[] {
  const parsed = raw as RawResponse;
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    return [];
  }

  const validCardIds = new Set(
    getModeDefinition(request.mode).cards.map((card) => card.id),
  );

  const perCardCount = new Map<string, number>();
  const accepted: GeneratedSuggestion[] = [];

  for (const item of parsed.items) {
    if (accepted.length >= MAX_ITEMS_PER_CALL) break;

    const cardId = item.cardId?.trim();
    const text = item.text?.trim();
    const rationale = item.rationale?.trim();

    if (!cardId || !text || !rationale) continue;
    if (!validCardIds.has(cardId)) continue;

    const cardCount = perCardCount.get(cardId) ?? 0;
    if (cardCount >= MAX_ITEMS_PER_CARD_PER_CALL) continue;

    const visibleItems = itemsWithDisposition(request, cardId, [
      "active",
      "pinned",
      "done",
    ]);
    const duplicatesVisible = visibleItems.some((existingItem) =>
      isNearDuplicate(existingItem.text, text),
    );
    if (duplicatesVisible) continue;

    const discardedItems = itemsWithDisposition(request, cardId, ["discarded"]);
    const matchesDiscarded = discardedItems.some((existingItem) =>
      isNearDuplicate(existingItem.text, text),
    );
    if (matchesDiscarded) continue;

    const duplicatesAccepted = accepted.some(
      (acceptedItem) =>
        acceptedItem.cardId === cardId &&
        isNearDuplicate(acceptedItem.text, text),
    );
    if (duplicatesAccepted) continue;

    accepted.push({ cardId, text, rationale });
    perCardCount.set(cardId, cardCount + 1);
  }

  return accepted;
}
