import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";
import { Button } from "./ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "./ui/Dialog";

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
    <Dialog
      onDismiss={onDismiss}
      titleId="delete-meeting-dialog-title"
      descriptionId="delete-meeting-dialog-copy"
    >
      <DialogTitle id="delete-meeting-dialog-title">Delete this meeting permanently?</DialogTitle>
      <DialogDescription id="delete-meeting-dialog-copy">
        The transcript, summary, and context will be removed from this device.
        This cannot be undone — archive instead if you just want it out of the
        list.
      </DialogDescription>
      <Button
        ref={buttonRef}
        variant="danger"
        size="lg"
        className="w-full"
        onClick={onConfirm}
      >
        Delete
      </Button>
    </Dialog>
  );
}
