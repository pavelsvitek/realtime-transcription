import { useEffect, useRef } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

type AddContextDialogProps = {
  open: boolean;
  value: string;
  saving: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function AddContextDialog({
  open,
  value,
  saving,
  error,
  onChange,
  onCancel,
  onSave,
}: AddContextDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    textareaRef.current?.focus();
  }, [open]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onCancel();
    },
    {
      enabled: open && !saving,
      conflictBehavior: "allow",
      meta: { name: "Close meeting context" },
    },
  );

  if (!open) return null;

  return (
    <div
      className="context-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <form
        className="context-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="meeting-context-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) onSave();
        }}
      >
        <h2 id="meeting-context-title" className="context-dialog-title">
          Add context
        </h2>
        <p className="context-dialog-copy">
          Paste participants, project notes, or anything else that should inform
          the meeting summary.
        </p>
        <label className="context-dialog-label" htmlFor="meeting-context-field">
          Context
        </label>
        <textarea
          id="meeting-context-field"
          ref={textareaRef}
          className="context-dialog-textarea"
          value={value}
          disabled={saving}
          rows={10}
          placeholder="Participants: …"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              if (!saving) onSave();
            }
          }}
        />
        {error && <p className="context-dialog-error">{error}</p>}
        <div className="context-dialog-actions">
          <button
            type="button"
            className="btn btn-clear"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
