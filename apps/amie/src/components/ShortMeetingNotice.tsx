import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

type ShortMeetingNoticeProps = {
  onDismiss: () => void;
};

export function ShortMeetingNotice({ onDismiss }: ShortMeetingNoticeProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

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
      meta: { name: "Dismiss short meeting notice" },
    },
  );

  return (
    <div className="start-meeting-dialog-backdrop" onPointerDown={onDismiss}>
      <div
        className="start-meeting-dialog short-meeting-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="short-meeting-dialog-title"
        aria-describedby="short-meeting-dialog-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p id="short-meeting-dialog-title" className="start-meeting-dialog-title">
          Short meeting
        </p>
        <p id="short-meeting-dialog-copy" className="short-meeting-dialog-copy">
          This meeting will not be summarized automatically, because it was
          shorter than 5 minutes. You can generate the summary yourself if you
          want to.
        </p>
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-start short-meeting-dialog-ok"
          onClick={onDismiss}
        >
          OK
        </button>
      </div>
    </div>
  );
}
