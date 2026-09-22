import { forwardRef } from "react";
import { TranscriptionIcon } from "./sidebar-icons";

export type LiveMeetingButtonProps = {
  listening?: boolean;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick: () => void;
};

export function liveMeetingButtonLabel(listening: boolean, loading: boolean): string {
  if (listening) return "Listening ..";
  if (loading) return "Loading model...";
  return "Start a meeting";
}

const VOICE_BARS = [
  { h: 2.4, delay: "0s" },
  { h: 3.6, delay: "0.09s" },
  { h: 5.4, delay: "0.18s" },
  { h: 3.8, delay: "0.05s" },
  { h: 6.8, delay: "0.22s" },
  { h: 5.1, delay: "0.12s" },
  { h: 7.4, delay: "0.27s" },
  { h: 4.4, delay: "0.07s" },
  { h: 6.0, delay: "0.2s" },
  { h: 3.3, delay: "0.14s" },
  { h: 2.6, delay: "0.03s" },
] as const;

const VOICE_BAR_WIDTH = 1.3;
const VOICE_BAR_GAP = 0.55;
const VOICE_VIEW_WIDTH = 26;
const VOICE_CENTER_Y = 8;

function ListeningEqIcon() {
  const barsWidth =
    VOICE_BARS.length * VOICE_BAR_WIDTH +
    (VOICE_BARS.length - 1) * VOICE_BAR_GAP;
  const startX = (VOICE_VIEW_WIDTH - barsWidth) / 2;

  return (
    <svg
      className="listening-eq"
      width="22"
      height="14"
      viewBox={`0 0 ${VOICE_VIEW_WIDTH} 16`}
      aria-hidden="true"
    >
      <rect
        className="listening-eq-pill"
        x="1"
        y="3"
        width="24"
        height="10"
        rx="5"
      />
      {VOICE_BARS.map((bar, index) => (
        <rect
          key={index}
          className="listening-eq-bar"
          x={startX + index * (VOICE_BAR_WIDTH + VOICE_BAR_GAP)}
          y={VOICE_CENTER_Y - bar.h / 2}
          width={VOICE_BAR_WIDTH}
          height={bar.h}
          rx={VOICE_BAR_WIDTH / 2}
          style={{ animationDelay: bar.delay }}
        />
      ))}
    </svg>
  );
}

export const LiveMeetingButton = forwardRef<
  HTMLButtonElement,
  LiveMeetingButtonProps
>(function LiveMeetingButton(
  { listening = false, loading = false, disabled, className, onClick },
  ref,
) {
  const label = liveMeetingButtonLabel(listening, loading);
  return (
    <button
      ref={ref}
      type="button"
      className={[
        "start-meeting-button",
        listening ? "start-meeting-button--listening" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading && !listening}
      aria-label={label}
    >
      {listening ? <ListeningEqIcon /> : <TranscriptionIcon />}
      <span className="start-meeting-button-label">{label}</span>
    </button>
  );
});
