"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import type { CardView } from "@/lib/session/types";

type SuggestionCardProps = {
  card: CardView;
  onDiscard: (itemId: string) => void;
  onPin: (itemId: string) => void;
  onDone: (itemId: string) => void;
};

const SCROLL_END_THRESHOLD_PX = 20;

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

function isScrolledToEnd(container: HTMLElement): boolean {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    SCROLL_END_THRESHOLD_PX
  );
}

function DoneCheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 text-emerald-600"
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const prevLastItemIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const lastItemId = card.items.at(-1)?.id ?? null;
    const itemAdded =
      lastItemId !== null && lastItemId !== prevLastItemIdRef.current;

    prevLastItemIdRef.current = lastItemId;

    if (!itemAdded || !pinnedToBottomRef.current) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      });
    });
  }, [card.items]);

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-stone-200 bg-white shadow-sm">
      <header className="shrink-0 border-b border-stone-100 px-3 py-1.5">
        <h2 className="text-[11px] font-normal tracking-wide text-stone-500">
          {card.title}
        </h2>
      </header>

      <div
        ref={scrollRef}
        onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;
          pinnedToBottomRef.current = isScrolledToEnd(container);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
      >
        <ul className="mt-auto flex flex-col gap-1.5 p-2">
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
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={DISCARD_EXIT}
                  transition={ITEM_TRANSITION}
                  className={`overflow-hidden rounded-md border ${
                    isDone
                      ? "border-stone-100 bg-stone-50/70 px-2.5 py-1.5"
                      : isNewest
                        ? "border-stone-200 bg-white p-2.5 shadow-sm"
                        : "border-stone-100 bg-stone-50 p-2.5"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-pretty text-sm leading-snug ${
                        isDone
                          ? "font-normal text-stone-500"
                          : `${isNewest ? "font-medium" : "font-normal"} ${RECENCY_TEXT_TONES[tier]}`
                      }`}
                    >
                      {item.text}
                    </p>
                    {isDone ? (
                      <DoneCheckIcon />
                    ) : item.disposition === "pinned" ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-800">
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
                          className={`mt-1 text-xs leading-relaxed ${RECENCY_RATIONALE_TONES[tier]}`}
                        >
                          {item.rationale}
                        </p>

                        <div className="mt-1.5 flex gap-0.5">
                          <button
                            type="button"
                            onClick={() => onDiscard(item.id)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                          >
                            Discard
                          </button>
                          <button
                            type="button"
                            onClick={() => onPin(item.id)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
                          >
                            Pin
                          </button>
                          <button
                            type="button"
                            onClick={() => onDone(item.id)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-stone-500 transition hover:bg-stone-200/70 hover:text-stone-800"
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
              className="py-0.5 text-xs text-stone-400"
            >
              Waiting for suggestions…
            </motion.p>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
