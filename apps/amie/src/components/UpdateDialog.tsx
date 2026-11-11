import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";
import { formatBytes, type UpdateProgress } from "../lib/updates";

export type UpdateDialogView =
  | { kind: "checking" }
  | { kind: "upToDate"; version: string }
  | {
      kind: "available";
      version: string;
      currentVersion: string;
      notes: string | null;
      meetingActive: boolean;
      readOnlyBundle: boolean;
    }
  | { kind: "downloading"; version: string; progress: UpdateProgress }
  | {
      kind: "installedDeferred";
      version: string;
      meetingActive: boolean;
    }
  | { kind: "readOnly"; onRemovableVolume: boolean }
  | { kind: "error"; message: string };

type UpdateDialogProps = {
  view: UpdateDialogView;
  busy: boolean;
  onUpdate: () => void;
  onLater: () => void;
  onDismiss: () => void;
  onRelaunch: () => void;
};

export function UpdateDialog({
  view,
  busy,
  onUpdate,
  onLater,
  onDismiss,
  onRelaunch,
}: UpdateDialogProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  useHoldMeetingConfirmOpen(true);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [view.kind]);

  const canDismiss =
    view.kind !== "checking" && view.kind !== "downloading" && !busy;

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing || !canDismiss) return;
      onDismiss();
    },
    {
      enabled: canDismiss,
      conflictBehavior: "allow",
      meta: { name: "Dismiss update dialog" },
    },
  );

  const title = titleFor(view);
  const copy = copyFor(view);

  return (
    <div
      className="start-meeting-dialog-backdrop"
      onPointerDown={canDismiss ? onDismiss : undefined}
    >
      <div
        className="start-meeting-dialog short-meeting-dialog update-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-dialog-title"
        aria-describedby="update-dialog-copy"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p id="update-dialog-title" className="start-meeting-dialog-title">
          {title}
        </p>
        <p id="update-dialog-copy" className="short-meeting-dialog-copy">
          {copy}
        </p>
        {view.kind === "downloading" ? (
          <div className="update-dialog-progress" aria-live="polite">
            <div className="update-dialog-progress-track">
              <div
                className="update-dialog-progress-bar"
                style={{ width: `${progressPercent(view.progress)}%` }}
              />
            </div>
            <p className="update-dialog-progress-label">
              {progressText(view.progress)}
            </p>
          </div>
        ) : null}
        <div className="update-dialog-actions">
          {view.kind === "available" ? (
            <>
              <button
                type="button"
                className="btn update-dialog-secondary"
                onClick={onLater}
                disabled={busy}
              >
                Later
              </button>
              <button
                ref={primaryRef}
                type="button"
                className="btn btn-start update-dialog-primary"
                onClick={onUpdate}
                disabled={busy || view.readOnlyBundle}
              >
                {view.readOnlyBundle ? "Copy to Applications" : "Update"}
              </button>
            </>
          ) : null}
          {view.kind === "installedDeferred" ? (
            <button
              ref={primaryRef}
              type="button"
              className="btn btn-start update-dialog-primary"
              onClick={onRelaunch}
              disabled={busy || view.meetingActive}
            >
              {view.meetingActive ? "Stop meeting to restart" : "Restart Amie"}
            </button>
          ) : null}
          {view.kind === "upToDate" ||
          view.kind === "error" ||
          view.kind === "readOnly" ? (
            <button
              ref={primaryRef}
              type="button"
              className="btn btn-start short-meeting-dialog-ok"
              onClick={onDismiss}
            >
              OK
            </button>
          ) : null}
          {view.kind === "checking" || view.kind === "downloading" ? (
            <button
              ref={primaryRef}
              type="button"
              className="btn update-dialog-secondary"
              disabled
            >
              {view.kind === "checking" ? "Checking…" : "Downloading…"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function titleFor(view: UpdateDialogView): string {
  switch (view.kind) {
    case "checking":
      return "Checking for updates…";
    case "upToDate":
      return "Amie is up to date";
    case "available":
      return `Amie ${view.version} is available`;
    case "downloading":
      return `Downloading Amie ${view.version}`;
    case "installedDeferred":
      return `Amie ${view.version} is ready`;
    case "readOnly":
      return "Move Amie to Applications";
    case "error":
      return "Couldn’t check for updates";
  }
}

function copyFor(view: UpdateDialogView): string {
  switch (view.kind) {
    case "checking":
      return "Looking for a newer build on GitHub Releases.";
    case "upToDate":
      return `You’re on Amie ${view.version}.`;
    case "available": {
      const notes = view.notes?.trim();
      if (view.readOnlyBundle) {
        return "Amie is running from a read-only location (for example a DMG). Copy it to /Applications, then check for updates again.";
      }
      const base =
        notes && notes.length > 0
          ? notes
          : `Version ${view.version} is ready to download (you have ${view.currentVersion}).`;
      return view.meetingActive
        ? `${base} Download can start now; Amie will wait to restart until you stop the meeting.`
        : base;
    }
    case "downloading":
      return "Amie will replace the installed app after the download finishes.";
    case "installedDeferred":
      return view.meetingActive
        ? "The update is installed. Restart Amie after you stop the meeting so the new version can launch."
        : "The update is installed. Restart Amie to launch the new version.";
    case "readOnly":
      return view.onRemovableVolume
        ? "This copy looks like it’s still on a mounted disk image. Drag Amie to /Applications, open that copy, then try again."
        : "This copy of Amie can’t be updated in place. Copy it to /Applications and open that version.";
    case "error":
      return view.message;
  }
}

function progressPercent(progress: UpdateProgress): number {
  if (!progress.contentLength || progress.contentLength <= 0) return 10;
  return Math.min(
    100,
    Math.round((progress.downloaded / progress.contentLength) * 100),
  );
}

function progressText(progress: UpdateProgress): string {
  if (progress.contentLength && progress.contentLength > 0) {
    return `${formatBytes(progress.downloaded)} of ${formatBytes(progress.contentLength)}`;
  }
  return `${formatBytes(progress.downloaded)} downloaded`;
}
