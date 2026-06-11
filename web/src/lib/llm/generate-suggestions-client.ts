import type {
  CardUpdate,
  GenerateSuggestionsRequest,
  GeneratedSuggestion,
} from "@/lib/session/types";

export async function fetchGenerateSuggestions(
  request: GenerateSuggestionsRequest,
): Promise<GeneratedSuggestion[]> {
  const response = await fetch("/api/suggestions/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(body.error ?? `Suggestion request failed (${response.status})`);
  }

  const data = (await response.json()) as { items: GeneratedSuggestion[] };
  return data.items ?? [];
}

export function mapSuggestionsToCardUpdates(
  items: GeneratedSuggestion[],
): CardUpdate[] {
  const byCard = new Map<string, CardUpdate>();

  for (const item of items) {
    const existing = byCard.get(item.cardId);
    const op = {
      kind: "append" as const,
      text: item.text,
      rationale: item.rationale,
    };

    if (existing) {
      existing.ops.push(op);
    } else {
      byCard.set(item.cardId, { cardId: item.cardId, ops: [op] });
    }
  }

  return [...byCard.values()];
}
