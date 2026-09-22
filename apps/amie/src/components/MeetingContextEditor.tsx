import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createDebouncer } from "../lib/debounce";
import { usePatchMeetingMutation } from "../models/Meeting";

export const MEETING_CONTEXT_SAVE_DEBOUNCE_MS = 250;

/** Adopt a remote context only when the textarea has no unsaved edits. */
export function adoptRemoteContext(
  current: string,
  lastSaved: string,
  incoming: string,
): string | null {
  if (incoming === lastSaved) return null;
  if (current !== lastSaved) return null;
  return incoming;
}

export type MeetingContextEditorHandle = {
  flush: () => Promise<void>;
};

type MeetingContextEditorProps = {
  meetingId: string;
  initialContext: string | null;
  fieldId?: string;
  onContextChange?: (context: string | null) => void;
};

export const MeetingContextEditor = forwardRef<
  MeetingContextEditorHandle,
  MeetingContextEditorProps
>(function MeetingContextEditor(
  { meetingId, initialContext, fieldId = "meeting-context-editor", onContextChange },
  ref,
) {
  const [value, setValue] = useState(initialContext ?? "");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const meetingIdRef = useRef(meetingId);
  const lastSavedRef = useRef(initialContext ?? "");
  const inFlightRef = useRef<Promise<void>>(Promise.resolve());
  const onContextChangeRef = useRef(onContextChange);
  onContextChangeRef.current = onContextChange;
  const patchMeeting = usePatchMeetingMutation();
  const patchMeetingRef = useRef(patchMeeting);
  patchMeetingRef.current = patchMeeting;

  const persistRef = useRef<(next: string) => Promise<void>>(async () => {});
  persistRef.current = async (next: string) => {
    const id = meetingIdRef.current;
    if (next === lastSavedRef.current) return;
    setStatus("Saving…");
    setError(null);
    try {
      const saved = await patchMeetingRef.current.mutateAsync({
        id,
        payload: { context: next },
      });
      if (meetingIdRef.current !== id) return;
      lastSavedRef.current = saved.meeting.context ?? "";
      onContextChangeRef.current?.(saved.meeting.context);
      setStatus("Saved");
    } catch (e) {
      if (meetingIdRef.current !== id) return;
      setError(String(e));
      setStatus(null);
    }
  };

  const debouncerRef = useRef(
    createDebouncer(MEETING_CONTEXT_SAVE_DEBOUNCE_MS, (next: string) => {
      inFlightRef.current = persistRef.current(next);
    }),
  );

  useEffect(() => {
    const debouncer = debouncerRef.current;
    return () => {
      debouncer.flush();
    };
  }, [meetingId]);

  useEffect(() => {
    meetingIdRef.current = meetingId;
    const next = initialContext ?? "";
    setValue(next);
    lastSavedRef.current = next;
    setError(null);
    setStatus(null);
  }, [meetingId]);

  useEffect(() => {
    const incoming = initialContext ?? "";
    const adopted = adoptRemoteContext(value, lastSavedRef.current, incoming);
    if (adopted === null) return;
  }, [initialContext, meetingId]);

  useImperativeHandle(ref, () => ({
    flush: async () => {
      debouncerRef.current.flush();
      await inFlightRef.current;
    },
  }));

  return (
    <section className="meeting-panel">
      <label className="meeting-context-label" htmlFor={fieldId}>
        Context
      </label>
      <p className="meeting-context-copy">
        Participants, project notes, or anything else that should inform the
        summary. Changes save automatically.
      </p>
      <textarea
        id={fieldId}
        className="meeting-context-textarea"
        value={value}
        rows={14}
        placeholder="Participants: …"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          setStatus(null);
          debouncerRef.current.schedule(next);
        }}
      />
      {error ? (
        <p className="meeting-context-error">{error}</p>
      ) : status ? (
        <p className="meeting-context-status">{status}</p>
      ) : null}
    </section>
  );
});
