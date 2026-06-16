import { useEffect, useRef } from "react";
import { formatTime } from "../lib/format";
import type { TranscriptSegment } from "../lib/transcript-types";

type TranscriptFeedProps = {
  segments: TranscriptSegment[];
};

function lineClassName(segment: TranscriptSegment): string {
  const streamClass =
    segment.stream === "mic"
      ? "transcript-line--user"
      : "transcript-line--remote";
  return `transcript-line ${streamClass}`;
}

export function TranscriptFeed({ segments }: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [segments]);

  return (
    <div ref={scrollRef} className="transcript-feed">
      {segments.length === 0 ? (
        <p className="transcript-empty">
          Press Start to begin transcribing...
        </p>
      ) : (
        <ol className="transcript-list">
          {segments.map((segment) => (
            <li key={segment.id} className={lineClassName(segment)}>
              <span className="transcript-time">
                {formatTime(segment.startMs)}
              </span>
              <span className="transcript-speaker">{segment.speaker}</span>
              <span
                className={
                  segment.isPartial ? "transcript-text partial" : "transcript-text"
                }
              >
                {segment.text}
                {segment.isPartial && (
                  <span className="transcript-cursor" />
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
