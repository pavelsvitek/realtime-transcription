import type { MeetingSegment } from "./meetings";
import type { TranscriptPayload, TranscriptSegment } from "./transcript-types";

const COALESCE_GAP_MS = 1500;
/** Ignore micro-gaps from ASR chunk boundary rounding (e.g. 7 ms). */
const COALESCE_MIN_GAP_MS = 100;

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
  const withoutThisPartial = prev.filter((s) => s.id !== segment.id);
  const committed = sortSegments(withoutThisPartial.filter((s) => !s.isPartial));
  const otherPartials = sortSegments(
    withoutThisPartial.filter((s) => s.isPartial)
  );
  // Live partials stay after committed lines. xAI chunk events often have
  // start=0 or chunk-local times, which would otherwise sort them in front
  // of sentences that were already committed.
  return [...committed, ...otherPartials, segment];
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
  if (previous && previous.speaker === newSegment.speaker) {
    const gapMs = newSegment.startMs - previous.endMs;
    // Coalesce only on a deliberate refinement window. Tiny positive gaps (≤100 ms)
    // are adjacent ASR chunks; zero gap is back-to-back chunks; negative = overlap.
    if (gapMs >= COALESCE_MIN_GAP_MS && gapMs <= COALESCE_GAP_MS) {
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

/** Strip the `{meetingId}:` prefix stored in SQLite so live events can match. */
export function liveSegmentId(storedId: string): string {
  const idx = storedId.indexOf(":");
  return idx === -1 ? storedId : storedId.slice(idx + 1);
}

function storedStream(stream: string): TranscriptStream {
  return stream === "mic" ? "mic" : "system";
}

export function meetingSegmentsToTranscript(
  segments: MeetingSegment[],
): TranscriptSegment[] {
  return segments.map((segment) => ({
    id: liveSegmentId(segment.id),
    speaker: segment.speaker,
    stream: storedStream(segment.stream),
    text: segment.text,
    isPartial: false,
    startMs: segment.startMs,
    endMs: segment.endMs,
  }));
}

/** Keep a live User/Remote label when an older row was saved without one. */
export function mergeRestoredTranscript(
  previous: TranscriptSegment[],
  restored: TranscriptSegment[],
): TranscriptSegment[] {
  const previousById = new Map(previous.map((segment) => [segment.id, segment]));
  return restored.map((segment) => {
    if (segment.speaker) return segment;
    const prior = previousById.get(segment.id);
    if (!prior?.speaker) return segment;
    return { ...segment, speaker: prior.speaker, stream: prior.stream };
  });
}
