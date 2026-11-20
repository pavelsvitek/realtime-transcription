import { getMicrophoneRecordingName, usesMicrophoneInput } from "../lib/audio-device-label";
import type { AudioSource, DeviceKind } from "../lib/transcript-types";
import { LiveMeetingButton } from "./LiveMeetingButton";

const GHOST_ROWS = [
  { time: "0:04", speaker: "Maya", user: true, width: 54 },
  { time: "0:13", speaker: "Sam", user: false, width: 62 },
  { time: "0:26", speaker: "Jordan", user: false, width: 50 },
  { time: "0:35", speaker: "Sam", user: false, width: 45 },
  { time: "0:48", speaker: "Maya", user: true, width: 58 },
  { time: "0:57", speaker: "Sam", user: false, width: 40 },
  { time: "1:09", speaker: "Jordan", user: false, width: 48 },
  { time: "1:18", speaker: "Maya", user: true, width: 56 },
  { time: "1:30", speaker: "Sam", user: false, width: 36 },
  { time: "1:41", speaker: "Jordan", user: false, width: 52 },
  { time: "1:52", speaker: "Maya", user: true, width: 44 },
  { time: "2:04", speaker: "Sam", user: false, width: 50 },
] as const;

export function transcriptIdlePrivacyLine(
  audioSource: AudioSource,
  deviceName: string | null,
  deviceKind: DeviceKind | null,
): string {
  if (!usesMicrophoneInput(audioSource)) return "Transcribed on this Mac";
  return `Transcribed on this Mac with ${getMicrophoneRecordingName(deviceName, deviceKind)} microphone`;
}

type TranscriptIdleProps = {
  audioSource: AudioSource;
  deviceName: string | null;
  deviceKind: DeviceKind | null;
  loading?: boolean;
  onStart: () => void;
};

/** Empty Transcript tab before a meeting: faded preview rows behind a start card. */
export function TranscriptIdle({
  audioSource,
  deviceName,
  deviceKind,
  loading = false,
  onStart,
}: TranscriptIdleProps) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <ul
        aria-hidden="true"
        className="m-0 flex list-none flex-col gap-2 p-4 opacity-60"
      >
        {GHOST_ROWS.map((row) => (
          <li key={row.time} className="flex items-center gap-2 py-[7px]">
            <span className="min-w-9 shrink-0 text-[12px] text-text-muted/40 tabular-nums">
              {row.time}
            </span>
            <span
              className={
                row.user
                  ? "min-w-12 shrink-0 text-[13px] font-semibold text-brand-speaker-user/45"
                  : "min-w-12 shrink-0 text-[13px] font-semibold text-brand-speaker-remote/45"
              }
            >
              {row.speaker}
            </span>
            <span
              className="h-2 rounded bg-surface-muted"
              style={{ width: `${row.width}%` }}
            />
          </li>
        ))}
      </ul>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-surface-content/35 via-surface-content/85 to-surface-content" />
      <div className="absolute inset-x-0 top-[22%] flex justify-center px-4">
        <div className="flex w-[420px] max-w-full flex-col items-center gap-3.5 rounded-2xl border border-border-default bg-surface-elevated px-7 pb-6 pt-7 shadow-[0_12px_40px_rgba(13,34,51,0.10)]">
          <WaveGlyph />
          <div className="flex flex-col items-center gap-1.5 text-center">
            <h2 className="m-0 text-[20px] font-semibold tracking-[-0.02em] text-text-primary">
              Your transcript lands here
            </h2>
            <p className="m-0 text-[13px] leading-[1.5] text-text-secondary">
              Every speaker, time-stamped, as they talk. Names fill in from your call app.
            </p>
          </div>
          <LiveMeetingButton
            loading={loading}
            disabled={loading}
            shortcut="⌘ N"
            onClick={onStart}
            className="px-[18px] py-[11px] text-[14px]"
          />
          <p className="m-0 flex items-center gap-1.5 text-[12px] text-text-muted">
            <LockIcon />
            {transcriptIdlePrivacyLine(audioSource, deviceName, deviceKind)}
          </p>
        </div>
      </div>
    </div>
  );
}

const GLYPH_BARS = [
  [8, "var(--brand-accent-soft-hover)"],
  [14, "var(--brand-accent-soft-hover)"],
  [22, "var(--brand-accent-soft-hover)"],
  [28, "var(--brand-accent)"],
  [18, "var(--brand-accent-soft-hover)"],
  [24, "var(--brand-accent-soft-hover)"],
  [12, "var(--brand-accent-soft-hover)"],
] as const;

function WaveGlyph() {
  return (
    <svg width="31" height="28" viewBox="0 0 31 28" aria-hidden="true">
      {GLYPH_BARS.map(([h, fill], i) => (
        <rect key={i} x={i * 5} y={(28 - h) / 2} width="3" height={h} rx="1.5" fill={fill} />
      ))}
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      className="size-3 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
