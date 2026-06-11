"use client";

import type { TranscriptListItem } from "@/lib/replay/load-fixture";
import { REPLAY_SPEED_OPTIONS } from "@/lib/replay/replay-speed";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
      <Button
        type="button"
        onClick={playing ? onPause : onPlay}
        title="Play / Pause (Space)"
      >
        {playing ? "Pause" : "Play"}
      </Button>

      <Button
        type="button"
        variant="outline"
        onClick={onReset}
        title="Reset (⌘ Backspace)"
      >
        Reset
      </Button>

      <ToggleGroup
        value={[String(speed)]}
        onValueChange={(values) => {
          const next = values[0];
          if (next) onSpeedChange(Number(next));
        }}
        variant="outline"
        spacing={0}
        size="sm"
        title="Speed (↑ / ↓) · Seek ±10s (← / →)"
      >
        {REPLAY_SPEED_OPTIONS.map((option) => (
          <ToggleGroupItem key={option} value={String(option)}>
            {option}×
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {transcripts.length > 1 ? (
        <Select
          value={selectedTranscriptId}
          onValueChange={(value) => {
            if (value) onTranscriptChange(value);
          }}
        >
          <SelectTrigger size="default">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {transcripts.map((transcript) => (
              <SelectItem key={transcript.id} value={transcript.id}>
                {transcript.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}
