import { TranscriptionIcon } from "./sidebar-icons";

type StartMeetingButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children?: string;
};

export function StartMeetingButton({
  onClick,
  disabled,
  className,
  children = "Start a meeting",
}: StartMeetingButtonProps) {
  return (
    <button
      type="button"
      className={["start-meeting-button", className].filter(Boolean).join(" ")}
      onClick={onClick}
      disabled={disabled}
    >
      <TranscriptionIcon />
      <span className="start-meeting-button-label">{children}</span>
    </button>
  );
}
