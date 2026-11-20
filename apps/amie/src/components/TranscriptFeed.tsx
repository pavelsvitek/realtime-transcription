import { useEffect, useRef } from "react";
import { cn } from "../lib/cn";
import { formatTime } from "../lib/format";
import { TranscriptIdle } from "./TranscriptIdle";
import type { AudioSource, DeviceKind, TranscriptSegment } from "../lib/transcript-types";

type TranscriptFeedProps = {
  segments: TranscriptSegment[];
  audioSource: AudioSource;
  deviceName: string | null;
  deviceKind: DeviceKind | null;
  active?: boolean;
  capturing?: boolean;
  loading?: boolean;
  onStart: () => void;
};


export function TranscriptFeed({
  segments,
  audioSource,
  deviceName,
  deviceKind,
  active = true,
  capturing = false,
  loading = false,
  onStart,
}: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [segments, active]);

  if (segments.length === 0 && !capturing) {
    return (
      <TranscriptIdle
        audioSource={audioSource}
        deviceName={deviceName}
        deviceKind={deviceKind}
        loading={loading}
        onStart={onStart}
      />
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
      {segments.length === 0 ? (
        <div className="flex flex-col gap-3 pt-10 text-center text-[14px] text-text-muted">
          <p className="m-0 text-text-secondary">Listening…</p>
        </div>
      ) : (
        <ol className="flex list-none flex-col gap-2">
          {segments.map((segment) => (
            <li key={segment.id} className="flex items-baseline gap-2">
              <span className="min-w-9 shrink-0 text-[12px] text-text-muted tabular-nums">
                {formatTime(segment.startMs)}
              </span>
              <span
                className={cn(
                  "min-w-12 shrink-0 text-[13px] font-semibold",
                  segment.stream === "mic"
                    ? "text-brand-speaker-user"
                    : "text-brand-speaker-remote",
                )}
              >
                {segment.speaker}
              </span>
              <span
                className={cn(
                  "text-[14px] leading-[1.6] text-text-primary",
                  segment.isPartial && "text-text-muted",
                )}
              >
                {segment.text}
                {segment.isPartial && (
                  <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-blink bg-text-muted align-middle" />
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
