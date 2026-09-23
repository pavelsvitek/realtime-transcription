import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { StartMeetingButton } from "./StartMeetingButton";

const StartMeetingConfirmOpenContext = createContext(false);
const MeetingDialogLockContext = createContext<(delta: 1 | -1) => void>(() => {});

export function useStartMeetingConfirmOpen() {
  return useContext(StartMeetingConfirmOpenContext);
}

/** Keep start/stop hotkeys and Escape-to-list off while another meeting dialog is open. */
export function useHoldMeetingConfirmOpen(hold: boolean) {
  const addLock = useContext(MeetingDialogLockContext);
  useEffect(() => {
    if (!hold) return;
    addLock(1);
    return () => addLock(-1);
  }, [hold, addLock]);
}

export type MeetingConfirmKind = "start" | "stop";

type StartMeetingConfirmLayerProps = {
  kind: MeetingConfirmKind | null;
  onConfirm: () => void;
  onDismiss: () => void;
  onHoldChange?: (held: boolean) => void;
  children: ReactNode;
};

export function StartMeetingConfirmLayer({
  kind,
  onConfirm,
  onDismiss,
  onHoldChange,
  children,
}: StartMeetingConfirmLayerProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [locks, setLocks] = useState(0);
  const dialogOpen = kind !== null;
  const overlayOpen = dialogOpen || locks > 0;
  const stopping = kind === "stop";
  const addLock = useCallback((delta: 1 | -1) => {
    setLocks((count) => Math.max(0, count + delta));
  }, []);

  useEffect(() => {
    onHoldChange?.(locks > 0);
  }, [locks, onHoldChange]);

  useEffect(() => {
    if (!dialogOpen) return;
    buttonRef.current?.focus();
  }, [dialogOpen, kind]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onDismiss();
    },
    {
      enabled: dialogOpen,
      conflictBehavior: "allow",
      meta: { name: stopping ? "Dismiss stop meeting" : "Dismiss start meeting" },
    },
  );

  return (
    <MeetingDialogLockContext.Provider value={addLock}>
      <StartMeetingConfirmOpenContext.Provider value={overlayOpen}>
        {children}
        {dialogOpen && (
          <div
            className="start-meeting-dialog-backdrop"
            onPointerDown={onDismiss}
          >
            <div
              className="start-meeting-dialog short-meeting-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="start-meeting-dialog-title"
              aria-describedby="start-meeting-dialog-copy"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <p id="start-meeting-dialog-title" className="start-meeting-dialog-title">
                {stopping ? "Stop the meeting?" : "Start a meeting?"}
              </p>
              <p id="start-meeting-dialog-copy" className="short-meeting-dialog-copy">
                {stopping
                  ? "Amie will finish capturing audio, save the transcript, and open the meeting so you can review or generate a summary."
                  : "Amie will start listening through your mic and system audio, keep a live transcript, and save the meeting when you stop."}
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
    </MeetingDialogLockContext.Provider>
  );
}
