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
    <section className="max-w-[720px]">
      <label className="block text-[12px] text-text-secondary" htmlFor={fieldId}>
        Context
      </label>
      <p className="mt-1.5 mb-3 text-[13px] leading-[1.45] text-text-secondary">
        Participants, project notes, or anything else that should inform the
        summary. Changes save automatically.
      </p>
      <textarea
        id={fieldId}
        className="block min-h-[240px] w-full resize-y rounded-md border border-border-input bg-surface-input px-3 py-2.5 font-[family-name:inherit] text-[13px] leading-[1.45] text-text-primary outline-none focus:border-brand-primary-focus focus:shadow-[0_0_0_2px_var(--brand-primary-ring)]"
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
        <p className="mt-2 text-[12px] text-status-danger-text">{error}</p>
      ) : status ? (
        <p className="mt-2 text-[12px] text-text-muted">{status}</p>
      ) : null}
    </section>
  );
});
