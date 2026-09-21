import { forwardRef } from "react";
import { TranscriptionIcon } from "./sidebar-icons";

type StartMeetingButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children?: string;
};

export const StartMeetingButton = forwardRef<
  HTMLButtonElement,
  StartMeetingButtonProps
>(function StartMeetingButton(
  { onClick, disabled, className, children = "Start a meeting" },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={["start-meeting-button", className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      <TranscriptionIcon />
      <span className="start-meeting-button-label">{children}</span>
    </button>
  );
});
