import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Button } from "./ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "./ui/Dialog";

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
    <Dialog
      onDismiss={onDismiss}
      titleId="short-meeting-dialog-title"
      descriptionId="short-meeting-dialog-copy"
    >
      <DialogTitle id="short-meeting-dialog-title">Short meeting</DialogTitle>
      <DialogDescription id="short-meeting-dialog-copy">
        This meeting will not be summarized automatically, because it was
        shorter than 5 minutes. You can generate the summary yourself if you
        want to.
      </DialogDescription>
      <Button ref={buttonRef} size="lg" className="w-full" onClick={onDismiss}>
        OK
      </Button>
    </Dialog>
  );
}
