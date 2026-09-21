import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useStartMeetingConfirmOpen } from "../components/StartMeetingConfirm";
import { Spinner } from "../components/Spinner";
import { MeetingTitle } from "../components/MeetingTitle";
import { MeetingOverflowMenu } from "../components/MeetingOverflowMenu";
import {
  MeetingContextEditor,
  type MeetingContextEditorHandle,
} from "../components/MeetingContextEditor";
import { MeetingTabs, meetingTabDomIds, type MeetingDetailTab } from "../components/MeetingTabs";
import { formatTime } from "../lib/format";
import { SummaryMarkdown } from "../components/SummaryMarkdown";
import {
  moveMeetingSelection,
  retainMeetingSelection,
} from "../lib/meeting-list-selection";
import {
  formatMeetingClock,
  formatMeetingDetailWhen,
  groupMeetingsByDay,
  type MeetingListItem,
  type MeetingRecord,
  type SummaryDeltaPayload,
  type SummaryJobSnapshot,
  type SummaryJobState,
  type SummaryStatusPayload,
} from "../lib/meetings";
import {
  EVENT_SUMMARY_DELTA,
  EVENT_SUMMARY_STATUS,
} from "../lib/tauri-events";
import {
  meetingKeys,
  useDeleteMeetingMutation,
  useGenerateMeetingSummaryMutation,
  useGetAllMeetingsQuery,
  useGetMeetingQuery,
  usePatchMeetingMutation,
} from "../models/Meeting";

type MeetingsView =
  | { kind: "list" }
  | { kind: "detail"; id: string };

function applyGeneratedTitle(
  queryClient: ReturnType<typeof useQueryClient>,
  meetingId: string,
  title: string | undefined,
) {
  if (!title) return;
  queryClient.setQueryData(
    meetingKeys.detail(meetingId),
    (prev: MeetingRecord | null | undefined) =>
      prev ? { ...prev, meeting: { ...prev.meeting, title } } : prev,
  );
  queryClient.setQueryData(
    meetingKeys.list(),
    (prev: MeetingListItem[] | undefined) =>
      prev?.map((meeting) =>
        meeting.id === meetingId ? { ...meeting, title } : meeting,
      ),
  );
}

export function MeetingsPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<MeetingsView>({ kind: "list" });
  const [tab, setTab] = useState<MeetingDetailTab>("summary");
  const contextEditorRef = useRef<MeetingContextEditorHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [jobState, setJobState] = useState<SummaryJobState>("idle");
  const [draft, setDraft] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const startConfirmOpen = useStartMeetingConfirmOpen();
  const orderedIdsRef = useRef<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const previousIdsRef = useRef<string[] | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const listQuery = useGetAllMeetingsQuery();
  const detailId = view.kind === "detail" ? view.id : undefined;
  const detailQuery = useGetMeetingQuery(detailId);
  const patchMeeting = usePatchMeetingMutation();
  const deleteMeetingMutation = useDeleteMeetingMutation();
  const generateSummaryMutation = useGenerateMeetingSummaryMutation();

  const meetings = listQuery.data ?? [];
  const record = detailQuery.data ?? null;
  const mutating = patchMeeting.isPending || deleteMeetingMutation.isPending;

  const detailIdRef = useRef<string | null>(null);
  detailIdRef.current = view.kind === "detail" ? view.id : null;

  const goBackToList = useCallback(() => {
    void contextEditorRef.current?.flush();
    setTab("summary");
    setMenuOpen(false);
    setView({ kind: "list" });
  }, []);

  // Click and Enter both open a meeting. Neither moves the keyboard cursor.
  const openMeeting = useCallback((id: string) => {
    setTab("summary");
    setError(null);
    setView({ kind: "detail", id });
  }, []);

  const listKeysEnabled = view.kind === "list" && !startConfirmOpen;

  useHotkey(
    "ArrowDown",
    (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setSelectedId((current) =>
        moveMeetingSelection(orderedIdsRef.current, current, "down"),
      );
    },
    {
      enabled: listKeysEnabled,
      ignoreInputs: true,
      conflictBehavior: "allow",
      meta: { name: "Select next meeting" },
    },
  );

  useHotkey(
    "ArrowUp",
    (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setSelectedId((current) =>
        moveMeetingSelection(orderedIdsRef.current, current, "up"),
      );
    },
    {
      enabled: listKeysEnabled,
      ignoreInputs: true,
      conflictBehavior: "allow",
      meta: { name: "Select previous meeting" },
    },
  );

  useHotkey(
    "Enter",
    (event) => {
      if (event.isComposing) return;
      const id = selectedIdRef.current;
      if (!id || !orderedIdsRef.current.includes(id)) return;
      event.preventDefault();
      openMeeting(id);
    },
    {
      enabled: listKeysEnabled,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
      conflictBehavior: "allow",
      meta: { name: "Open selected meeting" },
    },
  );

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      goBackToList();
    },
    {
      enabled: view.kind === "detail" && !menuOpen && !startConfirmOpen,
      ignoreInputs: true,
      conflictBehavior: "allow",
      meta: { name: "Back to meetings" },
    },
  );

  useEffect(() => {
    if (view.kind !== "detail") {
      setJobState("idle");
      setDraft("");
      setSummaryError(null);
      return;
    }

    const id = view.id;
    let cancelled = false;
    setJobState("idle");
    setDraft("");
    setSummaryError(null);
    void invoke<SummaryJobSnapshot>("get_summary_job", { id })
      .then((job) => {
        if (cancelled) return;
        if (job.title) {
          applyGeneratedTitle(queryClient, id, job.title);
        }
        setJobState(job.state);
        setDraft(job.draft);
        setSummaryError(job.error ?? null);
        if (job.state === "running") {
          setSummarizingIds((prev) => {
            const nextIds = new Set(prev);
            nextIds.add(id);
            return nextIds;
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [view, queryClient]);

  useEffect(() => {
    if (jobState === "done" && record?.meeting.summary) {
      setDraft(record.meeting.summary);
    }
  }, [jobState, record?.meeting.summary]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenDelta = await listen<SummaryDeltaPayload>(
        EVENT_SUMMARY_DELTA,
        (event) => {
          const { meetingId, text, title } = event.payload;
          setSummarizingIds((prev) => {
            const nextIds = new Set(prev);
            nextIds.add(meetingId);
            return nextIds;
          });
          applyGeneratedTitle(queryClient, meetingId, title);
          if (detailIdRef.current === meetingId) {
            setDraft(text);
            setJobState("running");
            setSummaryError(null);
          }
        }
      );
      if (cancelled) {
        unlistenDelta();
        return;
      }
      unlisteners.push(unlistenDelta);

      const unlistenStatus = await listen<SummaryStatusPayload>(
        EVENT_SUMMARY_STATUS,
        (event) => {
          const { meetingId, state, error: jobError } = event.payload;
          if (state === "running") {
            setSummarizingIds((prev) => {
              const nextIds = new Set(prev);
              nextIds.add(meetingId);
              return nextIds;
            });
          } else {
            setSummarizingIds((prev) => {
              const nextIds = new Set(prev);
              nextIds.delete(meetingId);
              return nextIds;
            });
          }

          if (detailIdRef.current === meetingId) {
            setJobState(state);
            setSummaryError(jobError ?? null);
            if (state === "done") {
              void queryClient.invalidateQueries({
                queryKey: meetingKeys.detail(meetingId),
              });
            }
          }

          if (state === "done") {
            void queryClient.invalidateQueries({
              queryKey: meetingKeys.list(),
            });
          }
        }
      );
      if (cancelled) {
        unlistenStatus();
        return;
      }
      unlisteners.push(unlistenStatus);
    };

    void setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient]);

  const groups = groupMeetingsByDay(meetings);
  const orderedIds = groups.flatMap((group) =>
    group.meetings.map((meeting) => meeting.id),
  );
  const orderedKey = orderedIds.join("\n");
  orderedIdsRef.current = orderedIds;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const nextIds = orderedIdsRef.current;
    const previousIds = previousIdsRef.current;
    previousIdsRef.current = nextIds;
    if (previousIds == null) return;
    setSelectedId((current) =>
      retainMeetingSelection(previousIds, nextIds, current),
    );
  }, [orderedKey]);

  useEffect(() => {
    if (view.kind !== "list" || !selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest" });
  }, [view.kind, selectedId]);

  const queryError =
    (view.kind === "list" && listQuery.error
      ? String(listQuery.error)
      : null) ||
    (view.kind === "detail" && detailQuery.error
      ? String(detailQuery.error)
      : null);
  const displayError = error ?? queryError;
  const detailMissing =
    view.kind === "detail" &&
    !detailQuery.isPending &&
    !detailQuery.isError &&
    detailQuery.data === null;

  const copySummary = async () => {
    const text = record?.meeting.summary;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied");
      window.setTimeout(() => setCopyStatus(null), 1500);
    } catch {
      setCopyStatus("Could not copy");
    }
  };

  const generateSummary = async () => {
    if (!record) return;
    setSummaryError(null);
    try {
      await contextEditorRef.current?.flush();
      await generateSummaryMutation.mutateAsync({ id: record.meeting.id });
    } catch (e) {
      setSummaryError(String(e));
    }
  };

  const archiveMeeting = async () => {
    if (view.kind !== "detail" || mutating) return;
    setError(null);
    try {
      await patchMeeting.mutateAsync({
        id: view.id,
        payload: { archivedAt: Date.now() },
      });
      goBackToList();
    } catch (e) {
      setError(String(e));
    }
  };

  const deleteMeeting = async () => {
    if (view.kind !== "detail" || mutating) return;
    setError(null);
    try {
      await deleteMeetingMutation.mutateAsync({ id: view.id });
      goBackToList();
    } catch (e) {
      setError(String(e));
    }
  };

  if (view.kind === "detail") {
    const meeting = record?.meeting;
    const running = jobState === "running";
    const hasTranscript = Boolean(
      record?.segments.some((segment) => segment.text.trim().length > 0)
    );
    const summaryText = running
      ? draft
      : meeting?.summary ?? (jobState === "done" ? draft : null);
    const generateLabel = running
      ? "Generating…"
      : meeting?.summary
        ? "Regenerate"
        : "Generate";
    const loading = detailQuery.isPending && !record;

    return (
      <main className="page meetings-page">
        <header className="page-header meetings-detail-header">
          <button
            type="button"
            className="meetings-back"
            onClick={goBackToList}
          >
            Meetings
          </button>
          <MeetingOverflowMenu
            disabled={mutating}
            onOpenChange={setMenuOpen}
            onArchive={() => void archiveMeeting()}
            onDelete={() => void deleteMeeting()}
          />
        </header>

        {displayError && <div className="error-banner">{displayError}</div>}
        {detailMissing && (
          <div className="error-banner">Meeting not found.</div>
        )}

        {loading ? (
          <div className="meetings-state">
            <Spinner />
            <p>Loading meeting…</p>
          </div>
        ) : meeting ? (
          <div className="meeting-detail">
            <p className="meeting-when">{formatMeetingDetailWhen(meeting.startedAt)}</p>
            <MeetingTitle
              meetingId={meeting.id}
              title={meeting.title}
              onError={(message) => setError(message)}
            />

            <MeetingTabs tab={tab} onChange={setTab} />

            <div
              id={meetingTabDomIds("meeting", "summary").panelId}
              role="tabpanel"
              aria-labelledby={meetingTabDomIds("meeting", "summary").tabId}
              hidden={tab !== "summary"}
            >
              <section className="meeting-panel">
                <div className="meeting-summary-toolbar">
                  <button
                    type="button"
                    className="meeting-copy"
                    onClick={() => void generateSummary()}
                    disabled={!hasTranscript}
                  >
                    {generateLabel}
                  </button>
                  <button
                    type="button"
                    className="meeting-copy"
                    onClick={() => void copySummary()}
                    disabled={!meeting.summary}
                  >
                    Copy summary
                  </button>
                  {copyStatus && <span className="meeting-copy-status">{copyStatus}</span>}
                </div>
                {summaryError && (
                  <p className="meeting-summary-error">{summaryError}</p>
                )}
                {running ? (
                  summaryText ? (
                    <>
                      <p className="meeting-summary-generating">Generating summary…</p>
                      <SummaryMarkdown markdown={summaryText} />
                    </>
                  ) : (
                    <p className="meeting-summary-generating">Generating summary…</p>
                  )
                ) : summaryText ? (
                  <SummaryMarkdown markdown={summaryText} />
                ) : (
                  <p className="meetings-empty-copy">
                    No summary yet. The transcript is saved; a summary will show up here
                    once one is generated.
                  </p>
                )}
              </section>
            </div>

            <div
              id={meetingTabDomIds("meeting", "context").panelId}
              role="tabpanel"
              aria-labelledby={meetingTabDomIds("meeting", "context").tabId}
              hidden={tab !== "context"}
            >
              <MeetingContextEditor
                ref={contextEditorRef}
                meetingId={meeting.id}
                initialContext={meeting.context}
              />
            </div>

            <div
              id={meetingTabDomIds("meeting", "transcript").panelId}
              role="tabpanel"
              aria-labelledby={meetingTabDomIds("meeting", "transcript").tabId}
              hidden={tab !== "transcript"}
            >
              <section className="meeting-panel">
                {record && record.segments.length > 0 ? (
                  <ol className="meeting-transcript">
                    {record.segments.map((segment) => (
                      <li key={segment.id} className="meeting-transcript-line">
                        <span className="transcript-time">
                          {formatTime(segment.startMs)}
                        </span>
                        <span className="transcript-text">{segment.text}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="meetings-empty-copy">
                    No transcript was saved for this meeting.
                  </p>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  return (
    <main className="page meetings-page">
      <header className="page-header">
        <h1 className="page-title">Meetings</h1>
      </header>

      {displayError && <div className="error-banner">{displayError}</div>}

      {listQuery.isPending && !listQuery.data ? (
        <div className="meetings-state">
          <Spinner />
          <p>Loading meetings…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="meetings-state">
          <p className="meetings-empty-title">No meetings yet</p>
          <p className="meetings-empty-copy">
            Start a transcription from New chat. When you stop, the meeting appears here.
          </p>
        </div>
      ) : (
        <div className="meetings-list">
          {groups.map((group) => (
            <section key={group.key} className="meetings-day">
              <h2 className="meetings-day-label">{group.label}</h2>
              <ul className="meetings-day-list">
                {group.meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) rowRefs.current.set(meeting.id, node);
                        else rowRefs.current.delete(meeting.id);
                      }}
                      className={
                        meeting.id === selectedId
                          ? "meetings-row meetings-row--selected"
                          : "meetings-row"
                      }
                      aria-current={meeting.id === selectedId ? "true" : undefined}
                      onClick={() => openMeeting(meeting.id)}
                    >
                      <span className="meetings-row-bar" aria-hidden="true" />
                      <span className="meetings-row-body">
                        <span className="meetings-row-title">{meeting.title}</span>
                        <span className="meetings-row-time">
                          {formatMeetingClock(meeting.startedAt)}
                        </span>
                        {summarizingIds.has(meeting.id) ? (
                          <span className="meetings-row-teaser">Summarizing…</span>
                        ) : (
                          meeting.teaser && (
                            <span className="meetings-row-teaser">{meeting.teaser}</span>
                          )
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
