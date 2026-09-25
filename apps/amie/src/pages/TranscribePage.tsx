import { useEffect, useRef, useState, type RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  MeetingContextEditor,
  type MeetingContextEditorHandle,
} from "../components/MeetingContextEditor";
import {
  MeetingTabs,
  meetingTabDomIds,
  LIVE_TRANSCRIPT_TAB_LABEL,
  type MeetingDetailTab,
} from "../components/MeetingTabs";
import { LiveMeetingButton } from "../components/LiveMeetingButton";
import { MicIndicator } from "../components/MicIndicator";
import { Spinner } from "../components/Spinner";
import { TranscriptFeed } from "../components/TranscriptFeed";
import { useAudioDevice } from "../hooks/useAudioDevice";
import { useMicLevel } from "../hooks/useMicLevel";
import { useTranscription } from "../hooks/useTranscription";
import type { FollowUpSeed } from "../lib/meetings";
import {
  finishedMeetingTitle,
  followUpContextFromSeed,
  meetingSkipsAutoSummary,
} from "../lib/meetings";
import type { AsrBackend, AudioSource, SpeakerTagsStatus } from "../lib/transcript-types";
import {
  getLiveMeeting,
  getMeeting,
  meetingKeys,
  patchMeeting,
  useGetLiveMeetingQuery,
} from "../models/Meeting";

const BACKEND_STORAGE_KEY = "asrBackend";
const LIVE_TAB_PREFIX = "transcribe";

function loadBackend(): AsrBackend {
  const raw = localStorage.getItem(BACKEND_STORAGE_KEY);
  return raw === "xai" ? "xai" : "local";
}

type TranscribePageProps = {
  /** Sidebar and Mod+N call this. Starting here, not in an effect, stays single under Strict Mode. */
  startMeetingRef?: RefObject<(() => void) | null>;
  /** Mod+Backspace confirm calls this. */
  stopMeetingRef?: RefObject<(() => void) | null>;
  /** Set by a follow-up confirm; applied to the new live meeting after start. */
  followUpSeedRef?: RefObject<FollowUpSeed | null>;
  onLiveSessionChange?: (session: { listening: boolean; loading: boolean }) => void;
  onMeetingFinished?: (result: {
    meetingId: string | null;
    skipAutoSummary: boolean;
  }) => void;
};

export function TranscribePage({
  startMeetingRef,
  stopMeetingRef,
  followUpSeedRef,
  onLiveSessionChange,
  onMeetingFinished,
}: TranscribePageProps) {
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const [speakerStatus, setSpeakerStatus] = useState<SpeakerTagsStatus | null>(null);
  const [backend, setBackend] = useState<AsrBackend>(loadBackend);
  const {
    segments,
    isActive,
    isLoading,
    isStopping,
    error,
    model,
    sessionSource,
    sessionBackend,
    start,
    stop,
    clear,
  } = useTranscription();
  const { device, error: deviceError } = useAudioDevice();
  const [tab, setTab] = useState<MeetingDetailTab>("transcript");
  const [isFinishing, setIsFinishing] = useState(false);
  const stopping = isStopping || isFinishing;
  const micActive = useMicLevel(isActive && !stopping);
  const queryClient = useQueryClient();
  const liveQuery = useGetLiveMeetingQuery(true);
  const liveMeeting = liveQuery.data ?? null;
  const contextEditorRef = useRef<MeetingContextEditorHandle>(null);
  const [followUpContext, setFollowUpContext] = useState<string | null>(null);
  const canStartRef = useRef(true);
  canStartRef.current = !isActive && !isLoading && !stopping;

  useEffect(() => {
    localStorage.setItem(BACKEND_STORAGE_KEY, backend);
  }, [backend]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void invoke<SpeakerTagsStatus>("get_speaker_tags_status")
        .then((next) => {
          if (!cancelled) setSpeakerStatus(next);
        })
        .catch(() => {
          if (!cancelled) setSpeakerStatus(null);
        });
    };
    load();
    const id = window.setInterval(load, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (sessionSource) {
      setAudioSource(sessionSource);
    }
  }, [sessionSource]);

  useEffect(() => {
    if (sessionBackend) {
      setBackend(sessionBackend);
    }
  }, [sessionBackend]);

  useEffect(() => {
    onLiveSessionChange?.({
      listening: isActive,
      loading: isLoading && !isActive,
    });
  }, [isActive, isLoading, onLiveSessionChange]);

  const handleStart = async () => {
    if (!canStartRef.current) return;
    setTab("transcript");
    const seed = followUpSeedRef?.current ?? null;
    if (followUpSeedRef) followUpSeedRef.current = null;
    const copiedContext = seed ? followUpContextFromSeed(seed) : null;
    setFollowUpContext(copiedContext);
    const started = await start(audioSource, backend, copiedContext);
    if (!started) {
      setFollowUpContext(null);
      return;
    }
    await queryClient.cancelQueries({ queryKey: meetingKeys.live() });
    await queryClient.invalidateQueries({ queryKey: meetingKeys.live() });
    if (copiedContext) {
      try {
        const live = await getLiveMeeting();
        if (live) {
          queryClient.setQueryData(meetingKeys.live(), {
            ...live,
            context: copiedContext,
          });
          if ((live.context ?? "") !== copiedContext) {
            await patchMeeting(live.id, { context: copiedContext });
          }
        }
      } catch (e) {
        console.warn("Failed to copy follow-up meeting", e);
      }
    }
  };

  if (startMeetingRef) {
    startMeetingRef.current = () => {
      void handleStart();
    };
  }

  const handleStop = async () => {
    if (!isActive && !stopping) return;
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await contextEditorRef.current?.flush();
      let meetingId: string | null;
      try {
        meetingId = await stop();
      } catch {
        return;
      }

      let skipAutoSummary = false;
      if (meetingId) {
        try {
          const record = await getMeeting(meetingId);
          const startedAt = record?.meeting.startedAt;
          const finishedAt = record?.meeting.finishedAt;
          if (startedAt != null && finishedAt != null) {
            skipAutoSummary = meetingSkipsAutoSummary(startedAt, finishedAt);
            await patchMeeting(meetingId, {
              title: finishedMeetingTitle(startedAt, finishedAt),
            });
          }
        } catch (e) {
          console.warn("Failed to name finished meeting", e);
        }
      }

      clear();
      setTab("transcript");
      setFollowUpContext(null);
      await queryClient.invalidateQueries({ queryKey: meetingKeys.all });
      onLiveSessionChange?.({ listening: false, loading: false });
      onMeetingFinished?.({ meetingId, skipAutoSummary });
    } finally {
      setIsFinishing(false);
    }
  };

  if (stopMeetingRef) {
    stopMeetingRef.current = () => {
      void handleStop();
    };
  }

  const summaryIds = meetingTabDomIds(LIVE_TAB_PREFIX, "summary");
  const contextIds = meetingTabDomIds(LIVE_TAB_PREFIX, "context");
  const transcriptIds = meetingTabDomIds(LIVE_TAB_PREFIX, "transcript");

  return (
    <main className="page transcribe-page">
      <header className="page-header">
        <div className="header-left">
          <h1 className="page-title">New chat</h1>
          {model && <span className="model-badge">{model}</span>}
        </div>
        <div className="header-controls">
          <label className="source-select">
            <span className="source-select-label">ASR</span>
            <select
              value={backend}
              onChange={(e) => setBackend(e.target.value as AsrBackend)}
              disabled={isActive || isLoading || stopping}
            >
              <option value="local">Local (Nemotron)</option>
              <option value="xai">xAI Transcribe 2.0</option>
            </select>
          </label>
          <label className="source-select">
            <span className="source-select-label">Input</span>
            <select
              value={audioSource}
              onChange={(e) => setAudioSource(e.target.value as AudioSource)}
              disabled={isActive || isLoading || stopping}
            >
              <option value="system">Chrome / system audio</option>
              <option value="mic">Microphone</option>
              <option value="both">Mic + system</option>
            </select>
          </label>
          <MicIndicator
            isActive={isActive && !stopping}
            micActive={micActive}
            error={error}
            deviceName={device?.name ?? null}
            deviceKind={device?.kind ?? null}
            deviceError={deviceError}
          />
          {isActive || stopping ? (
            <button
              className="btn btn-stop"
              onClick={() => void handleStop()}
              disabled={stopping}
              aria-busy={stopping}
              aria-label={stopping ? "Stopping transcription" : "Stop transcription"}
            >
              {stopping ? <Spinner className="btn-spinner" /> : "Stop"}
            </button>
          ) : (
            <LiveMeetingButton
              loading={isLoading}
              disabled={isLoading}
              onClick={() => void handleStart()}
            />
          )}
          {segments.length > 0 && !isActive && !stopping && (
            <button className="btn btn-clear" onClick={clear}>
              Clear
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      {speakerStatus?.meetingApp && !speakerStatus.trusted && (
        <div className="speaker-prompt">
          <p>Reads who Zoom or Teams shows as speaking. Does not record the screen.</p>
          <button
            className="btn btn-clear"
            type="button"
            onClick={() => {
              void invoke<SpeakerTagsStatus>("request_accessibility_permission")
                .then(setSpeakerStatus)
                .catch(() => undefined);
            }}
          >
            Allow Accessibility
          </button>
        </div>
      )}

      <div className="transcribe-tabs-bar">
        <MeetingTabs
          tab={tab}
          onChange={setTab}
          prefix={LIVE_TAB_PREFIX}
          transcriptLabel={LIVE_TRANSCRIPT_TAB_LABEL}
        />
      </div>

      <div
        id={summaryIds.panelId}
        role="tabpanel"
        aria-labelledby={summaryIds.tabId}
        className="transcribe-tab-panel transcribe-tab-panel--padded"
        hidden={tab !== "summary"}
      >
        <p className="meetings-empty-copy">
          Summary is generated after you stop the meeting.
        </p>
      </div>

      <div
        id={contextIds.panelId}
        role="tabpanel"
        aria-labelledby={contextIds.tabId}
        className="transcribe-tab-panel transcribe-tab-panel--padded"
        hidden={tab !== "context"}
      >
        {liveMeeting ? (
          <MeetingContextEditor
            ref={contextEditorRef}
            meetingId={liveMeeting.id}
            initialContext={followUpContext ?? liveMeeting.context}
            fieldId="live-meeting-context-editor"
          />
        ) : isActive ? (
          <p className="meetings-empty-copy">Loading meeting context…</p>
        ) : (
          <p className="meetings-empty-copy">
            Start transcription to add context for this meeting.
          </p>
        )}
      </div>

      <div
        id={transcriptIds.panelId}
        role="tabpanel"
        aria-labelledby={transcriptIds.tabId}
        className="transcribe-tab-panel"
        hidden={tab !== "transcript"}
      >
        <TranscriptFeed
          segments={segments}
          audioSource={audioSource}
          deviceName={device?.name ?? null}
          deviceKind={device?.kind ?? null}
          capturing={isActive}
          active={tab === "transcript"}
        />
      </div>

      <footer className="page-footer">
        <span className="status-text">
          {stopping
            ? "Stopping..."
            : isActive
            ? audioSource === "both"
              ? "Capturing mic + system audio..."
              : audioSource === "system"
                ? "Capturing Chrome audio..."
                : "Listening..."
            : segments.length > 0
              ? `${segments.filter((s) => !s.isPartial).length} segments`
              : "Ready"}
        </span>
      </footer>
    </main>
  );
}
