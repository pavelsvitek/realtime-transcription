import { useEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useStartMeetingConfirmOpen } from "./StartMeetingConfirm";

type MeetingOverflowMenuProps = {
  disabled?: boolean;
  followUpDisabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  onFollowUp: () => void;
  onArchive: () => void;
  onDelete: () => void;
};

export function MeetingOverflowMenu({
  disabled,
  followUpDisabled,
  onOpenChange,
  onFollowUp,
  onArchive,
  onDelete,
}: MeetingOverflowMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const startConfirmOpen = useStartMeetingConfirmOpen();
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setConfirmingDelete(false);
  };

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      close();
    },
    {
      enabled: open && !startConfirmOpen,
      conflictBehavior: "allow",
      meta: { name: "Close meeting menu" },
    },
  );

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        close();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) {
      close();
    }
  }, [disabled]);

  return (
    <div className="meeting-menu" ref={rootRef}>
      <button
        type="button"
        className="meeting-menu-trigger"
        aria-label="Meeting actions"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          if (open) {
            close();
            return;
          }
          setOpen(true);
        }}
      >
        <MenuDotsIcon />
      </button>
      {open && (
        <div className="meeting-menu-popover" role="menu">
          {confirmingDelete ? (
            <div className="meeting-menu-confirm">
              <p className="meeting-menu-confirm-copy">
                Delete this meeting permanently? This cannot be undone.
              </p>
              <div className="meeting-menu-confirm-actions">
                <button
                  type="button"
                  className="meeting-menu-item"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="meeting-menu-item meeting-menu-item-danger"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className="meeting-menu-item"
                role="menuitem"
                disabled={followUpDisabled}
                onClick={() => {
                  close();
                  onFollowUp();
                }}
              >
                <FollowUpIcon />
                Follow-up meeting…
              </button>
              <div className="meeting-menu-divider" />
              <button
                type="button"
                className="meeting-menu-item"
                role="menuitem"
                onClick={() => {
                  close();
                  onArchive();
                }}
              >
                <ArchiveIcon />
                Archive
              </button>
              <div className="meeting-menu-divider" />
              <button
                type="button"
                className="meeting-menu-item meeting-menu-item-danger"
                role="menuitem"
                onClick={() => setConfirmingDelete(true)}
              >
                <TrashIcon />
                Delete meeting…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MenuDotsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18" cy="12" r="1.7" />
    </svg>
  );
}

function FollowUpIcon() {
  return (
    <svg
      className="meeting-menu-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg
      className="meeting-menu-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="5" rx="1" />
      <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="meeting-menu-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
