import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { commitMeetingTitle } from "../lib/meetings";

type MeetingTitleProps = {
  meetingId: string;
  title: string;
  onTitleChange: (title: string) => void;
  onError: (message: string | null) => void;
};

export function MeetingTitle({
  meetingId,
  title,
  onTitleChange,
  onError,
}: MeetingTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);
  const saving = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(title);
    }
  }, [title, editing]);

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [editing]);

  const commit = async () => {
    if (saving.current) return;
    const next = commitMeetingTitle(draft);
    skipBlurCommit.current = true;
    setEditing(false);
    setDraft(next);
    if (next === title) return;

    saving.current = true;
    onTitleChange(next);
    try {
      const saved = await invoke<string>("update_meeting_title", {
        id: meetingId,
        title: next,
      });
      onError(null);
      if (saved !== next) {
        onTitleChange(saved);
        setDraft(saved);
      }
    } catch (e) {
      onTitleChange(title);
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
    <h1 className="meeting-title">
      <input
        ref={inputRef}
        className="meeting-title-input"
        value={draft}
        aria-label="Meeting title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          void commit();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            void commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            cancel();
          }
        }}
      />
    </h1>
  );
}
