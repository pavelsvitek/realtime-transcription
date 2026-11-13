import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";
import { Button } from "./ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "./ui/Dialog";

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
    <Dialog
      onDismiss={onDismiss}
      titleId="follow-up-meeting-dialog-title"
      descriptionId="follow-up-meeting-dialog-copy"
    >
      <DialogTitle id="follow-up-meeting-dialog-title">Do you want to create a follow-up meeting?</DialogTitle>
      <DialogDescription id="follow-up-meeting-dialog-copy">
        The follow-up meeting will copy the Context and Summary of this
        meeting into the new meeting's Context.
      </DialogDescription>
      <Button
        ref={buttonRef}
        size="lg"
        className="w-full"
        onClick={onConfirm}
      >
        Create follow-up
      </Button>
    </Dialog>
  );
}
