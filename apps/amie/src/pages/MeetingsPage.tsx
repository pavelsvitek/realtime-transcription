import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ArchiveMeetingConfirm } from "../components/ArchiveMeetingConfirm";
import { DeleteMeetingConfirm } from "../components/DeleteMeetingConfirm";
import { FollowUpMeetingConfirm } from "../components/FollowUpMeetingConfirm";
import { useStartMeetingConfirmOpen } from "../components/StartMeetingConfirm";
import { Spinner } from "../components/Spinner";
import { MeetingTitle } from "../components/MeetingTitle";
import { MeetingOverflowMenu } from "../components/MeetingOverflowMenu";
import {
  MeetingContextEditor,
  type MeetingContextEditorHandle,
} from "../components/MeetingContextEditor";
import { MeetingTabs, meetingTabDomIds, type MeetingDetailTab } from "../components/MeetingTabs";
import { ShortMeetingNotice } from "../components/ShortMeetingNotice";
import { formatTime } from "../lib/format";
import { SummaryMarkdown } from "../components/SummaryMarkdown";
import {
  moveMeetingSelection,
  retainMeetingSelection,
} from "../lib/meeting-list-selection";
import {
  ARCHIVE_MEETING_HOTKEY,
  FOLLOW_UP_MEETING_HOTKEY,
} from "../lib/nav-hotkeys";
import {
  followUpSeedFromMeeting,
  formatMeetingClock,
  formatMeetingDetailWhen,
  groupMeetingsByDay,
  type FollowUpSeed,
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
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { EmptyCopy } from "../components/ui/EmptyCopy";
import { cn } from "../lib/cn";

type MeetingsView =
  | { kind: "list" }
  | { kind: "detail"; id: string };

type MeetingsPageProps = {
  /** Meeting that was just finished, so the list can show an in-progress summary. */
  arrivedMeetingId?: string | null;
  /** Shown after a meeting under 5 minutes is saved without an automatic summary. */
  skipAutoSummaryNotice?: boolean;
  onDismissSkipAutoSummaryNotice?: () => void;
  /** True while a live meeting is starting or already listening. */
  meetingInProgress?: boolean;
  onFollowUpMeeting?: (seed: FollowUpSeed) => void;
};

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

export function MeetingsPage({
  arrivedMeetingId = null,
  skipAutoSummaryNotice = false,
  onDismissSkipAutoSummaryNotice,
  meetingInProgress = false,
  onFollowUpMeeting,
}: MeetingsPageProps) {
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
  const [followUpConfirm, setFollowUpConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
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
    setFollowUpConfirm(false);
    setArchiveConfirm(false);
    setDeleteConfirm(false);
    setView({ kind: "list" });
  }, []);

  // Click and Enter both open a meeting. Neither moves the keyboard cursor.
  const openMeeting = useCallback((id: string) => {
    setTab("summary");
    setError(null);
    setView({ kind: "detail", id });
  }, []);

  const listKeysEnabled =
    view.kind === "list" && !startConfirmOpen && !skipAutoSummaryNotice;

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
      enabled:
        view.kind === "detail" &&
        !menuOpen &&
        !followUpConfirm &&
        !archiveConfirm &&
        !deleteConfirm &&
        !startConfirmOpen &&
        !skipAutoSummaryNotice,
      ignoreInputs: true,
      conflictBehavior: "allow",
      meta: { name: "Back to meetings" },
    },
  );

  useHotkey(
    FOLLOW_UP_MEETING_HOTKEY,
    (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setFollowUpConfirm(true);
    },
    {
      enabled:
        view.kind === "detail" &&
        Boolean(record) &&
        !followUpConfirm &&
        !archiveConfirm &&
        !deleteConfirm &&
        !startConfirmOpen &&
        !skipAutoSummaryNotice &&
        !meetingInProgress &&
        !mutating,
      preventDefault: true,
      conflictBehavior: "allow",
      meta: {
        name: "Follow-up meeting",
        description: "Confirm creating a follow-up from this meeting",
      },
    },
  );

  useHotkey(
    ARCHIVE_MEETING_HOTKEY,
    (event) => {
      if (event.isComposing) return;
      event.preventDefault();
      setArchiveConfirm(true);
    },
    {
      enabled:
        view.kind === "detail" &&
        Boolean(record) &&
        !followUpConfirm &&
        !archiveConfirm &&
        !deleteConfirm &&
        !startConfirmOpen &&
        !skipAutoSummaryNotice &&
        !mutating,
      preventDefault: true,
      conflictBehavior: "allow",
      meta: {
        name: "Archive meeting",
        description: "Confirm archiving this meeting",
      },
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

      if (arrivedMeetingId) {
        const job = await invoke<SummaryJobSnapshot>("get_summary_job", {
          id: arrivedMeetingId,
        });
        if (!cancelled && job.state === "running") {
          setSummarizingIds((prev) => {
            const nextIds = new Set(prev);
            nextIds.add(arrivedMeetingId);
            return nextIds;
          });
          applyGeneratedTitle(queryClient, arrivedMeetingId, job.title);
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [arrivedMeetingId, queryClient]);

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

  const confirmFollowUp = async () => {
    if (view.kind !== "detail") return;
    setFollowUpConfirm(false);
    await contextEditorRef.current?.flush();
    const latest =
      queryClient.getQueryData<MeetingRecord | null>(
        meetingKeys.detail(view.id),
      ) ?? record;
    if (!latest) return;
    onFollowUpMeeting?.(followUpSeedFromMeeting(latest.meeting, draft));
  };

  const archiveMeeting = async () => {
    if (view.kind !== "detail" || mutating) return;
    setArchiveConfirm(false);
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
    setDeleteConfirm(false);
    setError(null);
    try {
      await deleteMeetingMutation.mutateAsync({ id: view.id });
      goBackToList();
    } catch (e) {
      setError(String(e));
    }
  };

  const shortMeetingNotice = skipAutoSummaryNotice ? (
    <ShortMeetingNotice
      onDismiss={() => onDismissSkipAutoSummaryNotice?.()}
    />
  ) : null;

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
      <>
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-content">
        <header className="relative z-[2] flex shrink-0 items-center justify-between overflow-visible py-3 pr-6 pl-4">
          <button
            type="button"
            className="cursor-pointer border-none bg-transparent p-0 font-[family-name:inherit] text-[12px] text-text-secondary hover:text-text-primary"
            onClick={goBackToList}
          >
            Meetings
          </button>
          <MeetingOverflowMenu
            disabled={mutating}
            followUpDisabled={meetingInProgress}
            onOpenChange={setMenuOpen}
            onFollowUp={() => setFollowUpConfirm(true)}
            onArchive={() => setArchiveConfirm(true)}
            onDelete={() => setDeleteConfirm(true)}
          />
        </header>

        {displayError && <ErrorBanner>{displayError}</ErrorBanner>}
        {detailMissing && (
          <ErrorBanner>Meeting not found.</ErrorBanner>
        )}

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-text-secondary">
            <Spinner />
            <p>Loading meeting…</p>
          </div>
        ) : meeting ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-8 pt-2 pb-10 [&_[hidden]]:hidden!">
            <p className="m-0 text-[13px] text-text-secondary">{formatMeetingDetailWhen(meeting.startedAt)}</p>
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
              <section className="max-w-[720px]">
                <div className="mb-[18px] flex items-center gap-2.5">
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 font-[family-name:inherit] text-[13px] text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void generateSummary()}
                    disabled={!hasTranscript}
                  >
                    {generateLabel}
                  </button>
                  <button
                    type="button"
                    className="cursor-pointer border-none bg-transparent p-0 font-[family-name:inherit] text-[13px] text-text-secondary disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void copySummary()}
                    disabled={!meeting.summary}
                  >
                    Copy summary
                  </button>
                  {copyStatus && (
                    <span className="text-[12px] text-text-muted">{copyStatus}</span>
                  )}
                </div>
                {summaryError && (
                  <p className="mt-0 mb-3.5 max-w-[420px] text-left text-[13px] leading-[1.45] text-text-secondary">{summaryError}</p>
                )}
                {running ? (
                  summaryText ? (
                    <>
                      <p className="mb-3 text-[13px] text-text-muted">Generating summary…</p>
                      <SummaryMarkdown markdown={summaryText} />
                    </>
                  ) : (
                    <p className="mb-3 text-[13px] text-text-muted">Generating summary…</p>
                  )
                ) : summaryText ? (
                  <SummaryMarkdown markdown={summaryText} />
                ) : (
                  <EmptyCopy>
                    No summary yet. The transcript is saved; a summary will show up here
                    once one is generated.
                  </EmptyCopy>
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
              <section className="max-w-[720px]">
                {record && record.segments.length > 0 ? (
                  <ol className="flex list-none flex-col gap-2.5">
                    {record.segments.map((segment) => (
                      <li
                        key={segment.id}
                        className="flex items-baseline gap-2.5"
                      >
                        <span className="min-w-9 shrink-0 text-[12px] text-text-muted tabular-nums">
                          {formatTime(segment.startMs)}
                        </span>
                        {segment.speaker ? (
                          <span
                            className={cn(
                              "min-w-0 shrink-0 text-[13px] font-semibold",
                              segment.stream === "mic"
                                ? "text-brand-speaker-user"
                                : "text-brand-speaker-remote",
                            )}
                          >
                            {segment.speaker}
                          </span>
                        ) : null}
                        <span className="text-[14px] leading-[1.6] text-text-primary">
                          {segment.text}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyCopy>
                    No transcript was saved for this meeting.
                  </EmptyCopy>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </main>
      {shortMeetingNotice}
      {followUpConfirm && (
        <FollowUpMeetingConfirm
          onConfirm={() => void confirmFollowUp()}
          onDismiss={() => setFollowUpConfirm(false)}
        />
      )}
      {archiveConfirm && (
        <ArchiveMeetingConfirm
          onConfirm={() => void archiveMeeting()}
          onDismiss={() => setArchiveConfirm(false)}
        />
      )}
      {deleteConfirm && (
        <DeleteMeetingConfirm
          onConfirm={() => void deleteMeeting()}
          onDismiss={() => setDeleteConfirm(false)}
        />
      )}
      </>
    );
  }

  return (
    <>
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-content">
      <header className="relative z-[2] flex shrink-0 items-center justify-between overflow-visible px-4 py-3">
        <h1 className="text-[12px]">Meetings</h1>
      </header>

      {displayError && <ErrorBanner>{displayError}</ErrorBanner>}

      {listQuery.isPending && !listQuery.data ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-text-secondary">
          <Spinner />
          <p>Loading meetings…</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-text-secondary">
          <p className="m-0 text-[15px] font-semibold text-text-primary">No meetings yet</p>
          <EmptyCopy>
            Start a transcription from New chat. When you stop, the meeting appears here.
          </EmptyCopy>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-2 pb-8">
          {groups.map((group) => (
            <section
              key={group.key}
              className="rounded-2xl border border-border-default px-[18px] pt-4 pb-2"
            >
              <h2 className="mb-2 text-[13px] font-medium text-text-secondary">
                {group.label}
              </h2>
              <ul className="list-none">
                {group.meetings.map((meeting) => (
                  <li key={meeting.id}>
                    <button
                      type="button"
                      ref={(node) => {
                        if (node) rowRefs.current.set(meeting.id, node);
                        else rowRefs.current.delete(meeting.id);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer scroll-my-2 items-start gap-3 border-none bg-transparent px-0 pt-2.5 pb-3 text-left font-[family-name:inherit] text-inherit",
                        meeting.id === selectedId && "rounded-[10px] bg-surface-hover",
                      )}
                      aria-current={meeting.id === selectedId ? "true" : undefined}
                      onClick={() => openMeeting(meeting.id)}
                    >
                      <span
                        className={cn(
                          "w-0.5 shrink-0 self-stretch rounded-[1px] bg-border-input",
                          meeting.id === selectedId && "bg-brand-accent",
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-text-primary">
                          {meeting.title}
                        </span>
                        <span className="text-[12px] text-text-secondary tabular-nums">
                          {formatMeetingClock(meeting.startedAt)}
                        </span>
                        {summarizingIds.has(meeting.id) ? (
                          <span className="text-[13px] leading-[1.4] text-text-muted">
                            Summarizing…
                          </span>
                        ) : (
                          meeting.teaser && (
                            <span className="text-[13px] leading-[1.4] text-text-muted">
                              {meeting.teaser}
                            </span>
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
    {shortMeetingNotice}
    </>
  );
}
