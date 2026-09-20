import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AddContextDialog } from "../components/AddContextDialog";
import { MicIndicator } from "../components/MicIndicator";
import { Spinner } from "../components/Spinner";
import { StartMeetingButton } from "../components/StartMeetingButton";
import { TranscriptFeed } from "../components/TranscriptFeed";
import { useAudioDevice } from "../hooks/useAudioDevice";
import { useMicLevel } from "../hooks/useMicLevel";
import { useTranscription } from "../hooks/useTranscription";
import type { MeetingDetail } from "../lib/meetings";
import type { AsrBackend, AudioSource } from "../lib/transcript-types";

const BACKEND_STORAGE_KEY = "asrBackend";

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
    start,
    stop,
    clear,
  } = useTranscription();
  const { device, error: deviceError } = useAudioDevice();
  const micActive = useMicLevel(isActive && !isStopping);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextMeetingId, setContextMeetingId] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [contextHasValue, setContextHasValue] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(BACKEND_STORAGE_KEY, backend);
  }, [backend]);

  useEffect(() => {
    if (startRequestId === 0) {
      return;
    }
    onStartRequestHandled?.();
    if (isActive || isLoading || isStopping) {
      return;
    }
    start(audioSource, backend);
  }, [startRequestId]);

  useEffect(() => {
    if (!isActive) {
      setContextHasValue(false);
      return;
    }
    let cancelled = false;
    void invoke<MeetingDetail | null>("get_live_meeting")
      .then((meeting) => {
        if (cancelled || !meeting) return;
        setContextMeetingId(meeting.id);
        setContextHasValue(Boolean(meeting.context?.trim()));
      })
      .catch(() => {
        /* Button still opens the dialog and loads context there. */
      });
    return () => {
      cancelled = true;
    };
  }, [isActive]);

  const closeContext = () => {
    if (contextSaving) return;
    setContextOpen(false);
    setContextError(null);
  };

  const saveContext = async (draft: string = contextDraft) => {
    const meetingId = contextMeetingId;
    if (!meetingId || contextSaving) return false;
    setContextSaving(true);
    setContextError(null);
    try {
      const saved = await invoke<string | null>("update_meeting_context", {
        id: meetingId,
        context: draft,
      });
      setContextHasValue(Boolean(saved?.trim()));
      setContextDraft(saved ?? "");
      setContextOpen(false);
      return true;
    } catch (e) {
      setContextError(String(e));
      return false;
    } finally {
      setContextSaving(false);
    }
  };

  const openContext = async () => {
    setContextError(null);
    try {
      const meeting = await invoke<MeetingDetail | null>("get_live_meeting");
      if (!meeting) {
        setContextError("No live meeting is in progress.");
        setContextOpen(true);
        return;
      }
      setContextMeetingId(meeting.id);
      setContextDraft(meeting.context ?? "");
      setContextHasValue(Boolean(meeting.context?.trim()));
      setContextOpen(true);
    } catch (e) {
      setContextError(String(e));
      setContextOpen(true);
    }
  };

  const handleStop = async () => {
    if (contextOpen && contextMeetingId) {
      await saveContext();
    }
    await stop();
  };

  return (
    <main className="page">
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
          {isActive && (
            <button
              type="button"
              className="btn btn-clear"
              onClick={() => void openContext()}
              disabled={isStopping || contextSaving}
              aria-haspopup="dialog"
              aria-expanded={contextOpen}
            >
              {contextHasValue ? "Edit context" : "Add context"}
            </button>
          )}
          {!isActive ? (
            <StartMeetingButton
              onClick={() => start(audioSource, backend)}
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

      <TranscriptFeed
        segments={segments}
        audioSource={audioSource}
        deviceName={device?.name ?? null}
        deviceKind={device?.kind ?? null}
      />

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

      <AddContextDialog
        open={contextOpen}
        value={contextDraft}
        saving={contextSaving}
        error={contextError}
        onChange={setContextDraft}
        onCancel={closeContext}
        onSave={() => {
          void saveContext();
        }}
      />
    </main>
  );
}
