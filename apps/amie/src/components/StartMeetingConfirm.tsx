import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { StartMeetingButton } from "./StartMeetingButton";

const StartMeetingConfirmOpenContext = createContext(false);

export function useStartMeetingConfirmOpen() {
  return useContext(StartMeetingConfirmOpenContext);
}

type StartMeetingConfirmLayerProps = {
  open: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  children: ReactNode;
};

export function StartMeetingConfirmLayer({
  open,
  onConfirm,
  onDismiss,
  children,
}: StartMeetingConfirmLayerProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    buttonRef.current?.focus();
  }, [open]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onDismiss();
    },
    {
      enabled: open,
      conflictBehavior: "allow",
      meta: { name: "Dismiss start meeting" },
    },
  );

  return (
    <StartMeetingConfirmOpenContext.Provider value={open}>
      {children}
      {open && (
        <div
          className="start-meeting-dialog-backdrop"
          onPointerDown={onDismiss}
        >
          <div
            className="start-meeting-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="start-meeting-dialog-title"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <p id="start-meeting-dialog-title" className="start-meeting-dialog-title">
              Start a meeting?
            </p>
            <StartMeetingButton ref={buttonRef} onClick={onConfirm} />
          </div>
        </div>
      )}
    </StartMeetingConfirmOpenContext.Provider>
  );
}
