import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { StartMeetingButton } from "./StartMeetingButton";

const StartMeetingConfirmOpenContext = createContext(false);

export function useStartMeetingConfirmOpen() {
  return useContext(StartMeetingConfirmOpenContext);
}

export type MeetingConfirmKind = "start" | "stop";

type StartMeetingConfirmLayerProps = {
  kind: MeetingConfirmKind | null;
  onConfirm: () => void;
  onDismiss: () => void;
  children: ReactNode;
};

export function StartMeetingConfirmLayer({
  kind,
  onConfirm,
  onDismiss,
  children,
}: StartMeetingConfirmLayerProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = kind !== null;
  const stopping = kind === "stop";

  useEffect(() => {
    if (!open) return;
    buttonRef.current?.focus();
  }, [open, kind]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onDismiss();
    },
    {
      enabled: open,
      conflictBehavior: "allow",
      meta: { name: stopping ? "Dismiss stop meeting" : "Dismiss start meeting" },
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
              {stopping ? "Stop the meeting?" : "Start a meeting?"}
            </p>
            {stopping ? (
              <button
                ref={buttonRef}
                type="button"
                className="btn btn-stop start-meeting-dialog-stop"
                onClick={onConfirm}
              >
                Stop
              </button>
            ) : (
              <StartMeetingButton ref={buttonRef} onClick={onConfirm} />
            )}
          </div>
        </div>
      )}
    </StartMeetingConfirmOpenContext.Provider>
  );
}
