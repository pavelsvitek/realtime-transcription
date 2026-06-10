import type { CardView } from "@/lib/session/types";

type SuggestionCardProps = {
  card: CardView;
  onDiscard: (itemId: string) => void;
  onPin: (itemId: string) => void;
  onDone: (itemId: string) => void;
};

const RECENCY_TEXT_TONES = [
  "text-stone-950",
  "text-stone-800",
  "text-stone-700",
  "text-stone-600",
] as const;

const RECENCY_RATIONALE_TONES = [
  "text-stone-600",
  "text-stone-500",
  "text-stone-500",
  "text-stone-400",
] as const;

function recencyTier(itemCount: number, index: number): number {
  if (itemCount <= 3) return 0;
  return Math.min(itemCount - 1 - index, RECENCY_TEXT_TONES.length - 1);
}

export function SuggestionCard({
  card,
  onDiscard,
  onPin,
  onDone,
}: SuggestionCardProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <header className="border-b border-stone-100 px-4 py-2.5">
        <h2 className="text-xs font-normal tracking-wide text-stone-500">
          {card.title}
        </h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        {card.items.length === 0 ? (
          <p className="p-4 text-sm text-stone-400">Waiting for suggestions…</p>
        ) : (
          <ul className="flex max-h-full flex-col justify-end gap-2.5 overflow-y-auto p-3.5">
            {card.items.map((item, index) => {
              const tier = recencyTier(card.items.length, index);
              const isNewest = tier === 0;

              return (
                <li
                  key={item.id}
                  className={`rounded-lg border p-3.5 ${
                    isNewest
                      ? "border-stone-200 bg-white shadow-sm"
                      : "border-stone-100 bg-stone-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-pretty text-[15px] leading-snug ${
                        isNewest ? "font-medium" : "font-normal"
                      } ${RECENCY_TEXT_TONES[tier]}`}
                    >
                      {item.text}
                    </p>
                    {item.disposition === "pinned" ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                        Pinned
                      </span>
                    ) : null}
                    {item.disposition === "done" ? (
                      <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800">
                        Done
                      </span>
                    ) : null}
                  </div>
                  <p
                    className={`mt-1.5 text-sm leading-relaxed ${RECENCY_RATIONALE_TONES[tier]}`}
                  >
                    {item.rationale}
                  </p>

                  <div className="mt-2.5 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onDiscard(item.id)}
                      className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      onClick={() => onPin(item.id)}
                      className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                    >
                      Pin
                    </button>
                    <button
                      type="button"
                      onClick={() => onDone(item.id)}
                      className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                    >
                      Done
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
