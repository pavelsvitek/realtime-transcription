"use client";

import { useEffect, useState } from "react";

export type McpPhase = "query" | "request" | "lookup" | "reply" | "response";

const BEATS: { phase: McpPhase; duration: number }[] = [
  { phase: "query", duration: 900 },
  { phase: "request", duration: 1700 },
  { phase: "lookup", duration: 1400 },
  { phase: "reply", duration: 1700 },
  { phase: "response", duration: 2600 },
];

const CYCLE = BEATS.reduce((sum, beat) => sum + beat.duration, 0);

function beatAt(elapsed: number): { phase: McpPhase; progress: number } {
  let t = elapsed % CYCLE;
  for (const beat of BEATS) {
    if (t < beat.duration) {
      return { phase: beat.phase, progress: t / beat.duration };
    }
    t -= beat.duration;
  }
  return { phase: "query", progress: 0 };
}

export function useMcpStory(active: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    const started = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      if (cancelled) return;
      setElapsed((now - started) % CYCLE);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [active]);

  if (!active) {
    return { phase: "response" as const, progress: 1 };
  }

  return beatAt(elapsed);
}
