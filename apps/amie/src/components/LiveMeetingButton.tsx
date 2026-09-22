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

function ListeningEqIcon() {
  return (
    <span className="listening-eq" aria-hidden="true">
      <span className="listening-eq-bar" />
      <span className="listening-eq-bar" />
      <span className="listening-eq-bar" />
      <span className="listening-eq-bar" />
    </span>
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
