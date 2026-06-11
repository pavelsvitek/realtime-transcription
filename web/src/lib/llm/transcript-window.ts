import { TRANSCRIPT_WINDOW_MS } from "./constants";

type TranscriptLineInput = {
  speaker: string;
  text: string;
  atMs: number;
  isPartial?: boolean;
};

export function buildTranscriptWindow(
  lines: TranscriptLineInput[],
  atMs: number,
  windowMs: number = TRANSCRIPT_WINDOW_MS,
) {
  const cutoff = atMs - windowMs;

  return lines
    .filter((line) => !line.isPartial && line.atMs >= cutoff && line.text.trim())
    .map((line) => ({
      speaker: line.speaker,
      text: line.text.trim(),
      atMs: line.atMs,
    }));
}

export function countWordsSince(
  lines: TranscriptLineInput[],
  sinceMs: number,
): number {
  let count = 0;

  for (const line of lines) {
    if (line.isPartial || line.atMs <= sinceMs) continue;
    const words = line.text.trim().split(/\s+/).filter(Boolean);
    count += words.length;
  }

  return count;
}

export function latestFinalizedAtMs(lines: TranscriptLineInput[]): number {
  let latest = 0;

  for (const line of lines) {
    if (line.isPartial || !line.text.trim()) continue;
    latest = Math.max(latest, line.atMs);
  }

  return latest;
}
