"use client";

import type { TranscriptListItem } from "@/lib/replay/load-fixture";
import { REPLAY_SPEED_OPTIONS } from "@/lib/replay/replay-speed";

type ReplayControlsProps = {
  playing: boolean;
  speed: number;
  transcripts: TranscriptListItem[];
  selectedTranscriptId: string;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onTranscriptChange: (id: string) => void;
};

export function ReplayControls({
  playing,
  speed,
  transcripts,
  selectedTranscriptId,
  onPlay,
  onPause,
  onReset,
  onSpeedChange,
  onTranscriptChange,
}: ReplayControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        title="Play / Pause (Space)"
        className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-stone-800"
      >
        {playing ? "Pause" : "Play"}
      </button>

      <button
        type="button"
        onClick={onReset}
        title="Reset (⌘ Backspace)"
        className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
      >
        Reset
      </button>

      <div
        className="flex items-center rounded-lg border border-stone-200 bg-white p-0.5"
        title="Speed (↑ / ↓) · Seek ±10s (← / →)"
      >
        {REPLAY_SPEED_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSpeedChange(option)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              speed === option
                ? "bg-stone-900 text-white"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            {option}×
          </button>
        ))}
      </div>

      {transcripts.length > 1 ? (
        <select
          value={selectedTranscriptId}
          onChange={(e) => onTranscriptChange(e.target.value)}
          className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-700"
        >
          {transcripts.map((transcript) => (
            <option key={transcript.id} value={transcript.id}>
              {transcript.title}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
