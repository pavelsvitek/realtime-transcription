export type TranscriptFixtureSegment = {
  id: string;
  start_ms: number;
  end_ms: number;
  speaker: string;
  text: string;
  final?: boolean;
};

export type WordTick = {
  atMs: number;
  segmentId: string;
  speakerKey: string;
  segmentStartMs: number;
  text: string;
  final: boolean;
};

function splitWords(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(/\s+/);
}

export function buildWordTimeline(
  segments: TranscriptFixtureSegment[],
): WordTick[] {
  const ticks: WordTick[] = [];

  for (const segment of segments) {
    const words = splitWords(segment.text);
    const duration = Math.max(segment.end_ms - segment.start_ms, 1);

    if (words.length === 0) {
      ticks.push({
        atMs: segment.start_ms,
        segmentId: segment.id,
        speakerKey: segment.speaker,
        segmentStartMs: segment.start_ms,
        text: "",
        final: true,
      });
      continue;
    }

    const step = duration / words.length;
    let cumulative = "";

    words.forEach((word, index) => {
      cumulative = cumulative ? `${cumulative} ${word}` : word;
      ticks.push({
        atMs: Math.round(segment.start_ms + index * step),
        segmentId: segment.id,
        speakerKey: segment.speaker,
        segmentStartMs: segment.start_ms,
        text: cumulative,
        final: index === words.length - 1,
      });
    });
  }

  return ticks.sort((a, b) => a.atMs - b.atMs);
}
