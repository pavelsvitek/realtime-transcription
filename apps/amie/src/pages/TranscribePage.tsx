import { useEffect, useRef, useState } from "react";
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
import { MicIndicator } from "../components/MicIndicator";
import { Spinner } from "../components/Spinner";
import { StartMeetingButton } from "../components/StartMeetingButton";
import { TranscriptFeed } from "../components/TranscriptFeed";
import { useAudioDevice } from "../hooks/useAudioDevice";
import { useMicLevel } from "../hooks/useMicLevel";
import { useTranscription } from "../hooks/useTranscription";
import type { AsrBackend, AudioSource } from "../lib/transcript-types";
import { meetingKeys, useGetLiveMeetingQuery } from "../models/Meeting";

const BACKEND_STORAGE_KEY = "asrBackend";
const LIVE_TAB_PREFIX = "transcribe";

function loadBackend(): AsrBackend {
  const raw = localStorage.getItem(BACKEND_STORAGE_KEY);
  return raw === "xai" ? "xai" : "local";
}

type TranscribePageProps = {
  startRequestId?: number;
  onStartRequestHandled?: () => void;
};

export function TranscribePage({
  startRequestId = 0,
  onStartRequestHandled,
}: TranscribePageProps) {
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
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
  const micActive = useMicLevel(isActive && !isStopping);
  const [tab, setTab] = useState<MeetingDetailTab>("transcript");
  const queryClient = useQueryClient();
  const liveQuery = useGetLiveMeetingQuery(true);
  const liveMeeting = liveQuery.data ?? null;
  const contextEditorRef = useRef<MeetingContextEditorHandle>(null);

  useEffect(() => {
    localStorage.setItem(BACKEND_STORAGE_KEY, backend);
  }, [backend]);

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
    if (startRequestId === 0) {
      return;
    }
    onStartRequestHandled?.();
    if (isActive || isLoading || isStopping) {
      return;
    }
    setTab("transcript");
    void start(audioSource, backend).then(() =>
      queryClient.invalidateQueries({ queryKey: meetingKeys.live() }),
    );
  }, [startRequestId]);

  const handleStart = async () => {
    setTab("transcript");
    await start(audioSource, backend);
    await queryClient.invalidateQueries({ queryKey: meetingKeys.live() });
  };

  const handleStop = async () => {
    await contextEditorRef.current?.flush();
    await stop();
    await queryClient.invalidateQueries({ queryKey: meetingKeys.live() });
  };

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
              disabled={isActive || isLoading || isStopping}
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
              disabled={isActive || isLoading || isStopping}
            >
              <option value="system">Chrome / system audio</option>
              <option value="mic">Microphone</option>
              <option value="both">Mic + system</option>
            </select>
          </label>
          <MicIndicator
            isActive={isActive && !isStopping}
            micActive={micActive}
            error={error}
            deviceName={device?.name ?? null}
            deviceKind={device?.kind ?? null}
            deviceError={deviceError}
          />
          {!isActive ? (
            <StartMeetingButton
              onClick={() => void handleStart()}
              disabled={isLoading}
            >
              {isLoading ? "Loading model..." : "Start a meeting"}
            </StartMeetingButton>
          ) : (
            <button
              className="btn btn-stop"
              onClick={() => void handleStop()}
              disabled={isStopping}
              aria-busy={isStopping}
              aria-label={isStopping ? "Stopping transcription" : "Stop transcription"}
            >
              {isStopping ? <Spinner className="btn-spinner" /> : "Stop"}
            </button>
          )}
          {segments.length > 0 && !isActive && (
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
            initialContext={liveMeeting.context}
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
          {isStopping
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
