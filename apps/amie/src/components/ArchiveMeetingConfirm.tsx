import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";
import { Button } from "./ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "./ui/Dialog";

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
    <Dialog
      onDismiss={onDismiss}
      titleId="archive-meeting-dialog-title"
      descriptionId="archive-meeting-dialog-copy"
    >
      <DialogTitle id="archive-meeting-dialog-title">Archive this meeting?</DialogTitle>
      <DialogDescription id="archive-meeting-dialog-copy">
        It will leave your Meetings list so everyday browsing stays focused.
        The transcript and summary stay saved on this device — nothing is
        deleted.
      </DialogDescription>
      <Button
        ref={buttonRef}
        size="lg"
        className="w-full"
        onClick={onConfirm}
      >
        Archive
      </Button>
    </Dialog>
  );
}
