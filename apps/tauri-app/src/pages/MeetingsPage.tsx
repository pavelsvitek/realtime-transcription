import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { Spinner } from "../components/Spinner";
import { MeetingTitle } from "../components/MeetingTitle";
import { MeetingOverflowMenu } from "../components/MeetingOverflowMenu";
import { formatTime } from "../lib/format";
import {
  formatMeetingClock,
  formatMeetingDetailWhen,
  groupMeetingsByDay,
  parseMeetingLlmOutput,
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

type MeetingsView =
  | { kind: "list" }
  | { kind: "detail"; id: string };

function applyGeneratedTitle(
  meetingId: string,
  title: string | undefined,
  setRecord: Dispatch<SetStateAction<MeetingRecord | null>>,
  setMeetings: Dispatch<SetStateAction<MeetingListItem[]>>,
) {
  if (!title) return;
  setRecord((prev) =>
    prev && prev.meeting.id === meetingId
      ? { ...prev, meeting: { ...prev.meeting, title } }
      : prev
  );
  setMeetings((prev) =>
    prev.map((meeting) =>
      meeting.id === meetingId ? { ...meeting, title } : meeting
    )
  );
}

function renderSummary(markdown: string) {
  return parseMeetingLlmOutput(markdown)
    .summary
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const bullet = line.replace(/^[-•]\s+/, "");
      const parts = bullet.split(/(\*\*[^*]+\*\*)/g);
      return (
        <li key={index}>
          {parts.map((part, partIndex) => {
            const bold = part.match(/^\*\*(.+)\*\*$/);
            if (bold) {
              return <strong key={partIndex}>{bold[1]}</strong>;
            }
            return <span key={partIndex}>{part}</span>;
          })}
        </li>
      );
    });
}

export function MeetingsPage() {
  const [view, setView] = useState<MeetingsView>({ kind: "list" });
  const [meetings, setMeetings] = useState<MeetingListItem[]>([]);
  const [record, setRecord] = useState<MeetingRecord | null>(null);
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [jobState, setJobState] = useState<SummaryJobState>("idle");
  const [draft, setDraft] = useState("");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summarizingIds, setSummarizingIds] = useState<Set<string>>(
    () => new Set()
  );
  const [mutating, setMutating] = useState(false);

  const detailIdRef = useRef<string | null>(null);
  detailIdRef.current = view.kind === "detail" ? view.id : null;

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await invoke<MeetingListItem[]>("list_meetings");
      setMeetings(items);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setRecord(null);
    setJobState("idle");
    setDraft("");
    setSummaryError(null);
    try {
      const job = await invoke<SummaryJobSnapshot>("get_summary_job", { id });
      const next = await invoke<MeetingRecord>("get_meeting", { id });
      if (job.title) {
        next.meeting.title = job.title;
      }
      setJobState(job.state);
      setDraft(job.draft);
      setSummaryError(job.error ?? null);
      setRecord(next);
      if (job.title) {
        setMeetings((prev) =>
          prev.map((meeting) =>
            meeting.id === id ? { ...meeting, title: job.title! } : meeting
          )
        );
      }
      if (job.state === "running") {
        setSummarizingIds((prev) => {
          const nextIds = new Set(prev);
          nextIds.add(id);
          return nextIds;
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const goBackToList = useCallback(() => {
    setTab("summary");
    setRecord(null);
    setView({ kind: "list" });
  }, []);

  useEffect(() => {
    if (view.kind === "list") {
      void loadList();
      return;
    }
    void loadDetail(view.id);
  }, [view, loadList, loadDetail]);

  useEffect(() => {
    if (view.kind !== "detail") return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      event.preventDefault();
      goBackToList();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view.kind, goBackToList]);

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
          applyGeneratedTitle(meetingId, title, setRecord, setMeetings);
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
              void invoke<MeetingRecord>("get_meeting", { id: meetingId })
                .then((next) => {
                  if (detailIdRef.current === meetingId) {
                    setRecord(next);
                    setDraft(next.meeting.summary ?? "");
                  }
                })
                .catch(() => {});
            }
          }

          if (state === "done") {
            void invoke<MeetingListItem[]>("list_meetings")
              .then(setMeetings)
              .catch(() => {});
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
  }, []);

  const groups = groupMeetingsByDay(meetings);

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
      await invoke("generate_meeting_summary", { id: record.meeting.id });
    } catch (e) {
      setSummaryError(String(e));
    }
  };

  const archiveMeeting = async () => {
    if (view.kind !== "detail" || mutating) return;
    setMutating(true);
    setError(null);
    try {
      await invoke("archive_meeting", { id: view.id });
      goBackToList();
    } catch (e) {
      setError(String(e));
    } finally {
      setMutating(false);
    }
  };

  const deleteMeeting = async () => {
    if (view.kind !== "detail" || mutating) return;
    setMutating(true);
    setError(null);
    try {
      await invoke("delete_meeting", { id: view.id });
      goBackToList();
    } catch (e) {
      setError(String(e));
    } finally {
      setMutating(false);
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
            onArchive={() => void archiveMeeting()}
            onDelete={() => void deleteMeeting()}
          />
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading && !record ? (
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
              onTitleChange={(title) => {
                setRecord((prev) =>
                  prev
                    ? { ...prev, meeting: { ...prev.meeting, title } }
                    : prev
                );
              }}
              onError={(message) => setError(message)}
            />

            <div className="meeting-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "summary"}
                className={tab === "summary" ? "meeting-tab active" : "meeting-tab"}
                onClick={() => setTab("summary")}
              >
                Summary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "transcript"}
                className={tab === "transcript" ? "meeting-tab active" : "meeting-tab"}
                onClick={() => setTab("transcript")}
              >
                Transcript
              </button>
            </div>

            {tab === "summary" ? (
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
                      <h2 className="meeting-summary-heading">Executive Summary</h2>
                      <ul className="meeting-summary-list">
                        {renderSummary(summaryText)}
                      </ul>
                    </>
                  ) : (
                    <p className="meeting-summary-generating">Generating summary…</p>
                  )
                ) : summaryText ? (
                  <>
                    <h2 className="meeting-summary-heading">Executive Summary</h2>
                    <ul className="meeting-summary-list">{renderSummary(summaryText)}</ul>
                  </>
                ) : (
                  <p className="meetings-empty-copy">
                    No summary yet. The transcript is saved; a summary will show up here
                    once one is generated.
                  </p>
                )}
              </section>
            ) : (
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
            )}
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

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
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
                      className="meetings-row"
                      onClick={() => {
                        setTab("summary");
                        setView({ kind: "detail", id: meeting.id });
                      }}
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
