"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/session/types";

type TranscriptPanelProps = {
  lines: TranscriptLine[];
};

export function TranscriptPanel({ lines }: TranscriptPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [lines]);

  return (
    <aside className="flex min-h-0 w-full flex-col border-l border-stone-200 bg-stone-50/50">
      <header className="border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-medium text-stone-800">Transcript</h2>
        <p className="mt-0.5 text-xs text-stone-500">Supporting context</p>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {lines.length === 0 ? (
          <p className="text-sm text-stone-400">Transcript will appear during replay…</p>
        ) : (
          <ol className="space-y-4">
            {lines.map((line) => (
              <li key={line.id} className="text-sm">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-medium text-stone-800">{line.speaker}</span>
                  <span className="text-xs text-stone-400">{line.timeLabel}</span>
                </div>
                <p
                  className={`leading-relaxed ${
                    line.isPartial ? "text-stone-500" : "text-stone-600"
                  }`}
                >
                  {line.text}
                  {line.isPartial ? (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-stone-400 align-middle" />
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
