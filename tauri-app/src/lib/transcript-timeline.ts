import type { TranscriptPayload, TranscriptSegment } from "./transcript-types";

const COALESCE_GAP_MS = 1500;

export type TranscriptStream = TranscriptSegment["stream"];

function parseStream(stream: string): TranscriptStream {
  return stream === "mic" ? "mic" : "system";
}

function tentativeIdForStream(stream: TranscriptStream): string {
  return `tentative-${stream}`;
}

function sortSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
  return [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    if (a.stream !== b.stream) return a.stream.localeCompare(b.stream);
    return a.id.localeCompare(b.id);
  });
}

function findPreviousCommittedSameStream(
  segments: TranscriptSegment[],
  idx: number,
  stream: TranscriptStream
): TranscriptSegment | null {
  for (let i = idx - 1; i >= 0; i--) {
    const segment = segments[i];
    if (segment.isPartial) continue;
    return segment.stream === stream ? segment : null;
  }
  return null;
}

function payloadToSegment(
  payload: TranscriptPayload,
  isPartial: boolean
): TranscriptSegment {
  return {
    id: payload.segmentId,
    speaker: payload.speaker,
    stream: parseStream(payload.stream),
    text: payload.text,
    isPartial,
    startMs: payload.startMs,
    endMs: payload.endMs,
  };
}

export function applyPartial(
  prev: TranscriptSegment[],
  payload: TranscriptPayload
): TranscriptSegment[] {
  const segment = payloadToSegment(payload, true);
  const idx = prev.findIndex((s) => s.isPartial && s.id === segment.id);
  const next =
    idx >= 0
      ? prev.map((s, i) => (i === idx ? segment : s))
      : [...prev, segment];
  return sortSegments(next);
}

export function applyCommit(
  prev: TranscriptSegment[],
  payload: TranscriptPayload
): TranscriptSegment[] {
  const stream = parseStream(payload.stream);
  const withoutPartial = prev.filter(
    (s) => s.id !== tentativeIdForStream(stream)
  );
  const newSegment = payloadToSegment(payload, false);
  const sorted = sortSegments([...withoutPartial, newSegment]);

  const idx = sorted.findIndex((s) => s.id === newSegment.id);
  if (idx <= 0) return sorted;

  const previous = findPreviousCommittedSameStream(sorted, idx, stream);
  if (previous) {
    const gapMs = newSegment.startMs - previous.endMs;
    // Coalesce only on a small positive gap (streaming refinement). gap=0 are
    // adjacent ASR chunks and stay separate lines; negative gap = bad timestamps.
    if (gapMs > 0 && gapMs <= COALESCE_GAP_MS) {
      const merged: TranscriptSegment = {
        ...previous,
        text: `${previous.text} ${newSegment.text}`,
        endMs: Math.max(previous.endMs, newSegment.endMs),
      };
      const withoutMerged = sorted.filter(
        (s) => s.id !== previous.id && s.id !== newSegment.id
      );
      return sortSegments([...withoutMerged, merged]);
    }
  }

  return sorted;
}

export function applyTranscriptEvent(
  prev: TranscriptSegment[],
  payload: TranscriptPayload,
  kind: "partial" | "commit"
): TranscriptSegment[] {
  return kind === "partial"
    ? applyPartial(prev, payload)
    : applyCommit(prev, payload);
}

/** Promote any in-flight partial lines to committed styling when capture ends. */
export function finalizePartials(
  segments: TranscriptSegment[]
): TranscriptSegment[] {
  const hasPartial = segments.some((segment) => segment.isPartial);
  if (!hasPartial) return segments;

  return segments.map((segment) =>
    segment.isPartial ? { ...segment, isPartial: false } : segment
  );
}
