"use client";

import { useEffect, useState } from "react";
import type { LiveScriptLine } from "@/data/roadmap-cut";

export type LiveTranscript = {
  /** Lines that are fully written. */
  done: readonly LiveScriptLine[];
  /** The line being written, with how many words are visible. */
  active: { line: LiveScriptLine; words: number; total: number } | null;
  /** True while the finished transcript fades out before the loop restarts. */
  fading: boolean;
};

type Options = {
  /** Scales every delay. 1 is natural speech, higher is slower. */
  pace?: number;
  /** Hold on the finished transcript before the loop restarts. */
  holdMs?: number;
  fadeMs?: number;
};

/** Random number in [lo, hi). */
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/**
 * How long a word takes to appear. Longer words take longer, commas and full
 * stops add a breath, and now and then the speaker hesitates. Speech is never
 * metronomic, so every delay is jittered.
 */
function wordDelay(word: string, pace: number): number {
  const letters = word.replace(/[^\p{L}\p{N}]/gu, "").length;
  let ms = 150 + letters * 32;
  if (/[,;:]$/.test(word)) ms += between(150, 260);
  if (/[.?!]$/.test(word)) ms += between(280, 480);
  ms *= between(0.7, 1.35);
  if (Math.random() < 0.07) ms += between(250, 550); // hesitation
  return Math.round(ms * pace);
}

/** Pause before the next speaker starts. Short replies come in faster. */
function turnGap(nextText: string, pace: number): number {
  const quick = nextText.split(" ").length <= 4;
  return Math.round((quick ? between(250, 520) : between(500, 1300)) * pace);
}

/**
 * Plays a conversation script word by word with human-like timing, then loops.
 * Starts from `initial` (the static state) so server and first client render match,
 * and does not animate for users who prefer reduced motion.
 */
export function useLiveTranscript(
  script: readonly LiveScriptLine[],
  initial: LiveTranscript,
  { pace = 1, holdMs = 3000, fadeMs = 600 }: Options = {},
): LiveTranscript {
  const [state, setState] = useState<LiveTranscript>(initial);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const after = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const play = (index: number, words: number) => {
      const line = script[index];
      const all = line.text.split(" ");
      const total = all.length;
      setState({
        done: script.slice(0, index),
        active: { line, words, total },
        fading: false,
      });
      if (words < total) {
        // Speech recognition sometimes lands two short words in one update.
        const burst =
          words + 1 < total && all[words].length <= 3 && Math.random() < 0.3;
        const next = words + (burst ? 2 : 1);
        after(wordDelay(all[words - 1], pace), () => play(index, next));
      } else if (index < script.length - 1) {
        after(turnGap(script[index + 1].text, pace), () => play(index + 1, 1));
      } else {
        after(holdMs, () => {
          setState({ done: script, active: null, fading: true });
          after(fadeMs, () => play(0, 1));
        });
      }
    };

    play(0, 1);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [script, pace, holdMs, fadeMs]);

  return state;
}
