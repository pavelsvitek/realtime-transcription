import { useEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { commitMeetingTitle } from "../lib/meetings";
import { usePatchMeetingMutation } from "../models/Meeting";

type MeetingTitleProps = {
  meetingId: string;
  title: string;
  onError: (message: string | null) => void;
};

export function MeetingTitle({
  meetingId,
  title,
  onError,
}: MeetingTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const skipBlurCommit = useRef(false);
  const saving = useRef(false);
  const patchMeeting = usePatchMeetingMutation();

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [title, editing]);

  const commit = async () => {
    if (saving.current) return;
    const next = commitMeetingTitle(draft);
    skipBlurCommit.current = true;
    setEditing(false);
    setDraft(next);
    if (next === title) return;

    saving.current = true;
    try {
      const saved = await patchMeeting.mutateAsync({
        id: meetingId,
        payload: { title: next },
      });
      onError(null);
      if (saved.meeting.title !== next) {
        setDraft(saved.meeting.title);
      }
    } catch (e) {
      setDraft(title);
      onError(String(e));
    } finally {
      saving.current = false;
    }
  };

  const cancel = () => {
    skipBlurCommit.current = true;
    setDraft(title);
    setEditing(false);
  };

  if (!editing) {
    return (
      <h1 className="meeting-title">
        <button
          type="button"
          className="meeting-title-button"
          onClick={() => {
            skipBlurCommit.current = false;
            setDraft(title);
            setEditing(true);
          }}
        >
          {title}
        </button>
      </h1>
    );
  }

  return (
    <MeetingTitleEditor
      draft={draft}
      onDraftChange={setDraft}
      onCommit={() => void commit()}
      onCancel={cancel}
      onBlurCommit={() => {
        if (skipBlurCommit.current) {
          skipBlurCommit.current = false;
          return;
        }
        void commit();
      }}
    />
  );
}

type MeetingTitleEditorProps = {
  draft: string;
  onDraftChange: (draft: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  onBlurCommit: () => void;
};

function MeetingTitleEditor({
  draft,
  onDraftChange,
  onCommit,
  onCancel,
  onBlurCommit,
}: MeetingTitleEditorProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  useHotkey(
    "Enter",
    (event) => {
      if (event.isComposing) return;
      onCommit();
    },
    {
      target: inputRef,
      ignoreInputs: false,
      meta: { name: "Save title" },
    },
  );

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onCancel();
    },
    {
      target: inputRef,
      ignoreInputs: false,
      conflictBehavior: "allow",
      meta: { name: "Cancel rename" },
    },
  );

  return (
    <h1 className="meeting-title">
      <input
        ref={inputRef}
        className="meeting-title-input"
        value={draft}
        aria-label="Meeting title"
        onChange={(event) => onDraftChange(event.target.value)}
        onBlur={onBlurCommit}
      />
    </h1>
  );
}
