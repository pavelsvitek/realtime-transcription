"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import { useEffect, useRef } from "react";
import type { CardView } from "@/lib/session/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SuggestionCardProps = {
  card: CardView;
  onDiscard: (itemId: string) => void;
  onPin: (itemId: string) => void;
  onUnpin: (itemId: string) => void;
  onDone: (itemId: string) => void;
  onUndoDone: (itemId: string) => void;
};

const SCROLL_END_THRESHOLD_PX = 20;

const RECENCY_TEXT_TONES = [
  "text-foreground",
  "text-foreground/90",
  "text-foreground/80",
  "text-muted-foreground",
] as const;

const RECENCY_RATIONALE_TONES = [
  "text-muted-foreground",
  "text-muted-foreground/90",
  "text-muted-foreground/80",
  "text-muted-foreground/70",
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

export function SuggestionCard({
  card,
  onDiscard,
  onPin,
  onUnpin,
  onDone,
  onUndoDone,
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
    <Card className="flex h-full min-h-0 gap-0 py-0 shadow-sm">
      <CardHeader className="shrink-0 border-b py-1.5">
        <CardTitle className="text-[11px] font-normal tracking-wide text-muted-foreground">
          {card.title}
        </CardTitle>
      </CardHeader>

      <CardContent
        ref={scrollRef}
        onScroll={() => {
          const container = scrollRef.current;
          if (!container) return;
          pinnedToBottomRef.current = isScrolledToEnd(container);
        }}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-0"
      >
        <ul className="mt-auto flex flex-col gap-1.5 p-2">
          <AnimatePresence initial mode="popLayout">
            {card.items.map((item, index) => {
              const isDone = item.disposition === "done";
              const isPinned = item.disposition === "pinned";
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
                  className={cn(
                    "overflow-hidden rounded-md border",
                    isDone
                      ? "border-border/60 bg-muted/50 px-2.5 py-1.5"
                      : isNewest
                        ? "border-border bg-card p-2.5 shadow-sm"
                        : "border-border/60 bg-muted/30 p-2.5",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-pretty text-sm leading-snug",
                        isDone
                          ? "font-normal text-muted-foreground"
                          : cn(
                              isNewest ? "font-medium" : "font-normal",
                              RECENCY_TEXT_TONES[tier],
                            ),
                      )}
                    >
                      {item.text}
                    </p>
                    {isDone ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Mark as not done"
                        onClick={() => onUndoDone(item.id)}
                        className="size-6 shrink-0 text-emerald-600 hover:text-emerald-700"
                      >
                        <Check className="size-3.5" />
                      </Button>
                    ) : isPinned ? (
                      <Badge
                        variant="secondary"
                        render={
                          <button
                            type="button"
                            aria-label="Unpin"
                            onClick={() => onUnpin(item.id)}
                          />
                        }
                        className="h-auto cursor-pointer rounded-full bg-amber-100 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-amber-800 hover:bg-amber-200/80"
                      >
                        Pinned
                      </Badge>
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
                          className={cn(
                            "mt-1 text-xs leading-relaxed",
                            RECENCY_RATIONALE_TONES[tier],
                          )}
                        >
                          {item.rationale}
                        </p>

                        <div className="mt-1.5 flex gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => onDiscard(item.id)}
                            className="h-auto px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            Discard
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() =>
                              isPinned ? onUnpin(item.id) : onPin(item.id)
                            }
                            className="h-auto px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            {isPinned ? "Unpin" : "Pin"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            onClick={() => onDone(item.id)}
                            className="h-auto px-1.5 py-0.5 text-[11px] text-muted-foreground"
                          >
                            Done
                          </Button>
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
              className="py-0.5 text-xs text-muted-foreground"
            >
              Waiting for suggestions…
            </motion.p>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}
