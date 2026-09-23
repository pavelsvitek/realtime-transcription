import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";

type ArchiveMeetingConfirmProps = {
  onConfirm: () => void;
  onDismiss: () => void;
};

export function ArchiveMeetingConfirm({
  onConfirm,
  onDismiss,
}: ArchiveMeetingConfirmProps) {
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
      meta: { name: "Dismiss archive meeting" },
    },
  );

  return (
    <div className="start-meeting-dialog-backdrop" onPointerDown={onDismiss}>
      <div
        className="start-meeting-dialog short-meeting-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="archive-meeting-dialog-title"
        aria-describedby="archive-meeting-dialog-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p
          id="archive-meeting-dialog-title"
          className="start-meeting-dialog-title"
        >
          Archive this meeting?
        </p>
        <p
          id="archive-meeting-dialog-copy"
          className="short-meeting-dialog-copy"
        >
          It will leave your Meetings list so everyday browsing stays focused.
          The transcript and summary stay saved on this device — nothing is
          deleted.
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-start short-meeting-dialog-ok"
          onClick={onConfirm}
        >
          Archive
        </button>
      </div>
    </div>
  );
}
