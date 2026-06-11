"use client";

import { useEffect, useRef } from "react";
import type { TranscriptLine } from "@/lib/session/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card className="flex min-h-0 w-full gap-0 rounded-none border-0 border-l py-0 shadow-none ring-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">Transcript</CardTitle>
        <CardDescription>Supporting context</CardDescription>
      </CardHeader>

      <CardContent
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      >
        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Transcript will appear during replay…
          </p>
        ) : (
          <ol className="space-y-4">
            {lines.map((line) => (
              <li key={line.id} className="text-sm">
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="font-medium text-foreground">
                    {line.speaker}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {line.timeLabel}
                  </span>
                </div>
                <p
                  className={`leading-relaxed ${
                    line.isPartial ? "text-muted-foreground" : "text-foreground/80"
                  }`}
                >
                  {line.text}
                  {line.isPartial ? (
                    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-muted-foreground align-middle" />
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
