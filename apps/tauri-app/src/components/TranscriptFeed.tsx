import { useEffect, useRef } from "react";
import { formatTime } from "../lib/format";
import { getMicrophoneRecordingName, usesMicrophoneInput } from "../lib/audio-device-label";
import type { AudioSource, DeviceKind, TranscriptSegment } from "../lib/transcript-types";

type TranscriptFeedProps = {
  segments: TranscriptSegment[];
  audioSource: AudioSource;
  deviceName: string | null;
  deviceKind: DeviceKind | null;
  active?: boolean;
};

function lineClassName(segment: TranscriptSegment): string {
  const streamClass =
    segment.stream === "mic"
      ? "transcript-line--user"
      : "transcript-line--remote";
  return `transcript-line ${streamClass}`;
}

export function TranscriptFeed({
  segments,
  audioSource,
  deviceName,
  deviceKind,
  active = true,
}: TranscriptFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const showMicHint = usesMicrophoneInput(audioSource);
  const recordingDeviceName = getMicrophoneRecordingName(deviceName, deviceKind);

  useEffect(() => {
    if (!active) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [segments, active]);

  return (
    <div ref={scrollRef} className="transcript-feed">
      {segments.length === 0 ? (
        <div className="transcript-empty">
          <p className="transcript-empty-title">
            Press Start to begin transcribing...
          </p>
          {showMicHint && (
            <p className="transcript-empty-hint">
              We will use {recordingDeviceName} microphone to record.
            </p>
          )}
        </div>
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
