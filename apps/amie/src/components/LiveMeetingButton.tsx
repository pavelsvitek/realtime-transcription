import { forwardRef } from "react";
import { cn } from "../lib/cn";
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
  { h: 4.6, delay: "0s" },
  { h: 6.8, delay: "0.09s" },
  { h: 10.4, delay: "0.18s" },
  { h: 7.2, delay: "0.05s" },
  { h: 13.2, delay: "0.22s" },
  { h: 9.8, delay: "0.12s" },
  { h: 15, delay: "0.27s" },
  { h: 8.4, delay: "0.07s" },
  { h: 11.6, delay: "0.2s" },
  { h: 6.4, delay: "0.14s" },
  { h: 5, delay: "0.03s" },
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
      className="block h-4 w-[22px] shrink-0 overflow-visible text-brand-on-primary"
      width="22"
      height="16"
      viewBox={`0 0 ${VOICE_VIEW_WIDTH} 16`}
      aria-hidden="true"
    >
      {VOICE_BARS.map((bar, index) => (
        <rect
          key={index}
          className="origin-center animate-listening-eq fill-current [transform-box:fill-box] motion-reduce:animate-none motion-reduce:transform-none"
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
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-[10px] border-none bg-brand-primary px-3 py-2.5 text-left font-[family-name:inherit] text-[13px] font-semibold text-brand-on-primary transition-[background-color] duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary-focus enabled:hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
        listening && "disabled:cursor-default disabled:opacity-100",
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-busy={loading && !listening}
      aria-label={label}
    >
      {listening ? <ListeningEqIcon /> : <TranscriptionIcon />}
      <span>{label}</span>
    </button>
  );
});
