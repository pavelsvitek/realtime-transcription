import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";

type DeleteMeetingConfirmProps = {
  onConfirm: () => void;
  onDismiss: () => void;
};

export function DeleteMeetingConfirm({
  onConfirm,
  onDismiss,
}: DeleteMeetingConfirmProps) {
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
      meta: { name: "Dismiss delete meeting" },
    },
  );

  return (
    <div className="start-meeting-dialog-backdrop" onPointerDown={onDismiss}>
      <div
        className="start-meeting-dialog short-meeting-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-meeting-dialog-title"
        aria-describedby="delete-meeting-dialog-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p
          id="delete-meeting-dialog-title"
          className="start-meeting-dialog-title"
        >
          Delete this meeting permanently?
        </p>
        <p
          id="delete-meeting-dialog-copy"
          className="short-meeting-dialog-copy"
        >
          The transcript, summary, and context will be removed from this device.
          This cannot be undone — archive instead if you just want it out of the
          list.
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-stop short-meeting-dialog-ok"
          onClick={onConfirm}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
