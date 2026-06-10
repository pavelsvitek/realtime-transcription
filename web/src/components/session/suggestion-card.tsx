"use client";

import { AnimatePresence, motion } from "framer-motion";
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

const ITEM_TRANSITION = {
  layout: { type: "spring", stiffness: 500, damping: 42, mass: 0.8 },
  opacity: { duration: 0.2 },
  y: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
} as const;

const DISCARD_EXIT = {
  opacity: 0,
  height: 0,
  marginTop: 0,
  marginBottom: 0,
  paddingTop: 0,
  paddingBottom: 0,
  transition: {
    opacity: { duration: 0.15 },
    height: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
    paddingTop: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
    paddingBottom: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
    marginTop: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
    marginBottom: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
  },
} as const;

const COLLAPSE_TRANSITION = {
  height: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] },
  opacity: { duration: 0.18 },
} as const;

function recencyTier(itemCount: number, index: number): number {
  if (itemCount <= 3) return 0;
  return Math.min(itemCount - 1 - index, RECENCY_TEXT_TONES.length - 1);
}

function DoneCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-emerald-600"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

export function SuggestionCard({
  card,
  onDiscard,
  onPin,
  onDone,
}: SuggestionCardProps) {
  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-stone-200 bg-white shadow-sm">
      <header className="shrink-0 border-b border-stone-100 px-4 py-2.5">
        <h2 className="text-xs font-normal tracking-wide text-stone-500">
          {card.title}
        </h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <ul className="mt-auto flex flex-col gap-2.5 p-3.5">
          <AnimatePresence initial mode="popLayout">
            {card.items.map((item, index) => {
              const isDone = item.disposition === "done";
              const tier = recencyTier(card.items.length, index);
              const isNewest = !isDone && tier === 0;

              return (
                <motion.li
                  key={item.id}
                  layout
                  layoutScroll
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={DISCARD_EXIT}
                  transition={ITEM_TRANSITION}
                  className={`overflow-hidden rounded-lg border ${
                    isDone
                      ? "border-stone-100 bg-stone-50/70 px-3.5 py-2.5"
                      : isNewest
                        ? "border-stone-200 bg-white p-3.5 shadow-sm"
                        : "border-stone-100 bg-stone-50 p-3.5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={`text-pretty leading-snug ${
                        isDone
                          ? "text-sm font-normal text-stone-500"
                          : `text-[15px] ${isNewest ? "font-medium" : "font-normal"} ${RECENCY_TEXT_TONES[tier]}`
                      }`}
                    >
                      {item.text}
                    </p>
                    {isDone ? (
                      <DoneCheckIcon />
                    ) : item.disposition === "pinned" ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                        Pinned
                      </span>
                    ) : null}
                  </div>

                  <AnimatePresence initial={false}>
                    {!isDone ? (
                      <motion.div
                        key="details"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={COLLAPSE_TRANSITION}
                        className="overflow-hidden"
                      >
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
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.li>
              );
            })}
          </AnimatePresence>

          {card.items.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="py-1 text-sm text-stone-400"
            >
              Waiting for suggestions…
            </motion.p>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
