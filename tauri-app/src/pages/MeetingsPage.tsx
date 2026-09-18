import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../components/Spinner";
import { formatTime } from "../lib/format";
import {
  formatMeetingClock,
  formatMeetingDetailWhen,
  groupMeetingsByDay,
  type MeetingListItem,
  type MeetingRecord,
} from "../lib/meetings";

type MeetingsView =
  | { kind: "list" }
  | { kind: "detail"; id: string };

function renderSummary(markdown: string) {
  return markdown
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
    try {
      const next = await invoke<MeetingRecord>("get_meeting", { id });
      setRecord(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view.kind === "list") {
      void loadList();
      return;
    }
    void loadDetail(view.id);
  }, [view, loadList, loadDetail]);

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

  if (view.kind === "detail") {
    const meeting = record?.meeting;
    return (
      <main className="page meetings-page">
        <header className="page-header meetings-detail-header">
          <button
            type="button"
            className="meetings-back"
            onClick={() => {
              setTab("summary");
              setRecord(null);
              setView({ kind: "list" });
            }}
          >
            Meetings
          </button>
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
            <h1 className="meeting-title">{meeting.title}</h1>

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
                    onClick={() => void copySummary()}
                    disabled={!meeting.summary}
                  >
                    Copy summary
                  </button>
                  {copyStatus && <span className="meeting-copy-status">{copyStatus}</span>}
                </div>
                {meeting.summary ? (
                  <>
                    <h2 className="meeting-summary-heading">Executive Summary</h2>
                    <ul className="meeting-summary-list">{renderSummary(meeting.summary)}</ul>
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
                        {meeting.teaser && (
                          <span className="meetings-row-teaser">{meeting.teaser}</span>
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
