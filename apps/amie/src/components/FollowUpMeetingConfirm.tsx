import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";

type FollowUpMeetingConfirmProps = {
  onConfirm: () => void;
  onDismiss: () => void;
};

export function FollowUpMeetingConfirm({
  onConfirm,
  onDismiss,
}: FollowUpMeetingConfirmProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useHoldMeetingConfirmOpen(true);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onDismiss();
    },
    {
      conflictBehavior: "allow",
      meta: { name: "Dismiss follow-up meeting" },
    },
  );

  return (
    <div className="start-meeting-dialog-backdrop" onPointerDown={onDismiss}>
      <div
        className="start-meeting-dialog short-meeting-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="follow-up-meeting-dialog-title"
        aria-describedby="follow-up-meeting-dialog-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p
          id="follow-up-meeting-dialog-title"
          className="start-meeting-dialog-title"
        >
          Do you want to create a follow-up meeting?
        </p>
        <p
          id="follow-up-meeting-dialog-copy"
          className="short-meeting-dialog-copy"
        >
          The follow-up meeting will copy the Context and Summary of this
          meeting into the new meeting's Context.
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-start short-meeting-dialog-ok"
          onClick={onConfirm}
        >
          Create follow-up
        </button>
      </div>
    </div>
  );
}
