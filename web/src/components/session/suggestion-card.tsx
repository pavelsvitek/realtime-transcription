import type { SuggestionCard as SuggestionCardData } from "@/lib/mock-session";

type SuggestionCardProps = {
  card: SuggestionCardData;
};

export function SuggestionCard({ card }: SuggestionCardProps) {
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <header className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-medium text-stone-800">{card.title}</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
        <ul className="flex max-h-full flex-col justify-end gap-3 overflow-y-auto p-4">
          {card.items.map((item, index) => {
            const fade =
              card.items.length > 3
                ? Math.max(0.35, 1 - (card.items.length - 1 - index) * 0.2)
                : 1;

            return (
              <li
                key={item.id}
                className="rounded-lg border border-stone-100 bg-stone-50/80 p-3"
                style={{ opacity: fade }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm leading-snug text-stone-900">{item.text}</p>
                  {item.state === "pinned" ? (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                      Pinned
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-stone-500">
                  {item.rationale}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                  >
                    Pin
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                  >
                    Done
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
