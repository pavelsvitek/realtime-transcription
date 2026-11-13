import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SpeakerNamesPrompt } from "../components/SpeakerNamesPrompt";
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
import { AudioDeviceMenu } from "../components/AudioDeviceMenu";
import { MicIndicator } from "../components/MicIndicator";
import { Spinner } from "../components/Spinner";
import { EmptyCopy } from "../components/ui/EmptyCopy";
import { ErrorBanner } from "../components/ui/ErrorBanner";
import { TranscriptFeed } from "../components/TranscriptFeed";
import { useAudioDevice } from "../hooks/useAudioDevice";
import { useAudioDevices } from "../hooks/useAudioDevices";
import { silenceSourceOf } from "../lib/capture-notices";
import { useMicLevel } from "../hooks/useMicLevel";
import { useSpeechModelDownload } from "../hooks/useSpeechModelDownload";
import { useTranscription } from "../hooks/useTranscription";
import {
  downloadFooterStatus,
  formatTranscriptionError,
} from "../lib/onboarding";
import type { FollowUpSeed } from "../lib/meetings";
import {
  finishedMeetingTitle,
  followUpContextFromSeed,
  meetingSkipsAutoSummary,
} from "../lib/meetings";
import type { AsrBackend, AudioSource } from "../lib/transcript-types";
import {
  getLiveMeeting,
  getMeeting,
  meetingKeys,
  patchMeeting,
  useGetLiveMeetingQuery,
} from "../models/Meeting";
import { Button } from "../components/ui/Button";

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
  const [backend, setBackend] = useState<AsrBackend>(loadBackend);
  const {
    segments,
    isActive,
    isLoading,
    isStopping,
    notices,
    dismissNotice,
    model,
    sessionSource,
    sessionBackend,
    start,
    stop,
    clear,
  } = useTranscription();
  const { device, error: deviceError } = useAudioDevice();
  const audioDevices = useAudioDevices();
  const modelDownload = useSpeechModelDownload();
  const [tab, setTab] = useState<MeetingDetailTab>("transcript");
  const [isFinishing, setIsFinishing] = useState(false);
  const stopping = isStopping || isFinishing;
  const { micActive, micMuted } = useMicLevel(isActive && !stopping);
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
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="relative z-[2] flex shrink-0 items-center justify-between overflow-visible px-4 py-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[12px] font-bold">New chat</h1>
          {model && (
            <span className="rounded-[10px] bg-surface-muted px-2 py-0.5 text-[11px] text-text-muted">
              {model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-visible">
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary">
            <span className="whitespace-nowrap">ASR</span>
            <select
              className="rounded-md border border-border-input bg-surface-input px-2 py-[5px] font-[family-name:inherit] text-[12px] text-text-primary"
              value={backend}
              onChange={(e) => setBackend(e.target.value as AsrBackend)}
              disabled={isActive || isLoading || stopping}
            >
              <option value="local">Local (Nemotron)</option>
              <option value="xai">xAI Transcribe 2.0</option>
            </select>
          </label>
          <MicIndicator
            isActive={isActive && !stopping}
            micActive={micActive}
            micMuted={micMuted}
            error={
              notices.find((notice) => silenceSourceOf(notice.message) === null)?.message ??
              null
            }
            deviceName={device?.name ?? null}
            deviceKind={device?.kind ?? null}
            deviceError={deviceError}
          />
          <AudioDeviceMenu
            inputs={audioDevices.devices.inputs}
            outputs={audioDevices.devices.outputs}
            defaultInputId={audioDevices.devices.defaultInputId}
            defaultOutputId={audioDevices.devices.defaultOutputId}
            inputChoice={audioDevices.choice.input}
            outputChoice={audioDevices.choice.output}
            showInput
            showOutput
            error={audioDevices.error}
            onChooseInput={audioDevices.chooseInput}
            onChooseOutput={audioDevices.chooseOutput}
            onOpen={() => void audioDevices.refresh()}
          />
          {isActive || stopping ? (
            <Button
              variant="danger"
              onClick={() => void handleStop()}
              disabled={stopping}
              aria-busy={stopping}
              aria-label={stopping ? "Stopping transcription" : "Stop transcription"}
            >
              {stopping ? <Spinner className="block size-4" /> : "Stop"}
            </Button>
          ) : (
            <LiveMeetingButton
              loading={isLoading}
              disabled={isLoading}
              onClick={() => void handleStart()}
            />
          )}
          {segments.length > 0 && !isActive && !stopping && (
            <Button variant="outline" onClick={clear}>
              Clear
            </Button>
          )}
        </div>
      </header>

      {notices.map((notice) => (
        <ErrorBanner
          key={notice.id}
          role="status"
          onDismiss={() => dismissNotice(notice.id)}
        >
          {formatTranscriptionError(notice.message, modelDownload.downloading)}
        </ErrorBanner>
      ))}

      <SpeakerNamesPrompt />

      <div className="shrink-0 px-4">
        <MeetingTabs
          tab={tab}
          onChange={setTab}
          prefix={LIVE_TAB_PREFIX}
          transcriptLabel={LIVE_TRANSCRIPT_TAB_LABEL}
          className="mb-3"
        />
      </div>

      <div
        id={summaryIds.panelId}
        role="tabpanel"
        aria-labelledby={summaryIds.tabId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden [&[hidden]]:hidden overflow-y-auto px-4 pb-6"
        hidden={tab !== "summary"}
      >
        <EmptyCopy>
          Summary is generated after you stop the meeting.
        </EmptyCopy>
      </div>

      <div
        id={contextIds.panelId}
        role="tabpanel"
        aria-labelledby={contextIds.tabId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden [&[hidden]]:hidden overflow-y-auto px-4 pb-6"
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
          <EmptyCopy>Loading meeting context…</EmptyCopy>
        ) : (
          <EmptyCopy>
            Start transcription to add context for this meeting.
          </EmptyCopy>
        )}
      </div>

      <div
        id={transcriptIds.panelId}
        role="tabpanel"
        aria-labelledby={transcriptIds.tabId}
        className="flex min-h-0 flex-1 flex-col overflow-hidden [&[hidden]]:hidden"
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

      <footer className="shrink-0 border-t border-border-default px-4 py-2">
        <span className="text-[12px] text-text-muted">
          {stopping
            ? "Stopping..."
            : isActive
              ? audioSource === "both"
                ? "Capturing mic + system audio..."
                : audioSource === "system"
                  ? "Capturing Chrome audio..."
                  : "Listening..."
              : modelDownload.downloading
                ? downloadFooterStatus(modelDownload.percent)
                : segments.length > 0
                  ? `${segments.filter((s) => !s.isPartial).length} segments`
                  : "Ready"}
        </span>
      </footer>
    </main>
  );
}
