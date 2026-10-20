import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioSource,
  AsrBackend,
  MicLevelPayload,
  TranscriptSegment,
  TranscriptPayload,
  TranscriptionStatusPayload,
} from "../lib/transcript-types";
import {
  EVENT_TRANSCRIPT_COMMIT,
  EVENT_TRANSCRIPT_PARTIAL,
  EVENT_TRANSCRIPTION_MIC_LEVEL,
  EVENT_TRANSCRIPTION_STATUS,
  EVENT_TRANSCRIPTION_SYSTEM_LEVEL,
} from "../lib/tauri-events";
import { rmsIndicatesSound } from "../lib/audio-level";
import { restoreLiveTranscription } from "../lib/restore-live-transcription";
import {
  applyTranscriptEvent,
  finalizePartials,
  mergeRestoredTranscript,
} from "../lib/transcript-timeline";
import {
  addCaptureNotice,
  clearSilenceOnSound,
  type CaptureNotice,
  type SilenceSource,
} from "../lib/capture-notices";
export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [notices, setNotices] = useState<CaptureNotice[]>([]);
  const dismissedNotices = useRef(new Set<string>());
  const heardSound = useRef(new Set<SilenceSource>());
  const [model, setModel] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<AudioSource | null>(null);
  const [sessionBackend, setSessionBackend] = useState<AsrBackend | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const startInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      try {
        const restored = await restoreLiveTranscription();
        if (cancelled) {
          return;
        }
        setIsActive(restored.active);
        setIsLoading(restored.loading);
        setModel(restored.model);
        setSessionSource(restored.source);
        setSessionBackend(restored.backend);
        if (restored.segments.length > 0) {
          setSegments((prev) => mergeRestoredTranscript(prev, restored.segments));
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("Failed to restore live transcription", e);
        }
      }

      const unlistenPartial = await listen<TranscriptPayload>(
        EVENT_TRANSCRIPT_PARTIAL,
        (event) => {
          setSegments((prev) =>
            applyTranscriptEvent(prev, event.payload, "partial")
          );
        }
      );
      if (cancelled) {
        unlistenPartial();
        return;
      }
      unlisteners.push(unlistenPartial);

      const unlistenCommit = await listen<TranscriptPayload>(
        EVENT_TRANSCRIPT_COMMIT,
        (event) => {
          setSegments((prev) =>
            applyTranscriptEvent(prev, event.payload, "commit")
          );
        }
      );
      if (cancelled) {
        unlistenCommit();
        return;
      }
      unlisteners.push(unlistenCommit);

      const unlistenStatus = await listen<TranscriptionStatusPayload>(
        EVENT_TRANSCRIPTION_STATUS,
        (event) => {
          const payload = event.payload;
          setIsActive(payload.active);
          setIsLoading(payload.loading ?? false);
          if (!payload.active) {
            setIsStopping(false);
            setSessionSource(null);
            setSessionBackend(null);
            setSegments((prev) => finalizePartials(prev));
          }
          if (payload.error) {
            setNotices((prev) =>
              addCaptureNotice(
                prev,
                dismissedNotices.current,
                heardSound.current,
                payload.error,
              ),
            );
          } else if (!payload.active && !payload.loading) {
            dismissedNotices.current.clear();
            heardSound.current.clear();
            setNotices([]);
          }
          if (payload.model) {
            setModel(payload.model);
          }
        }
      );
      if (cancelled) {
        unlistenStatus();
        return;
      }
      unlisteners.push(unlistenStatus);

      const hideSilenceWhenSound = (source: SilenceSource, rms: number) => {
        if (!rmsIndicatesSound(rms) || heardSound.current.has(source)) return;
        // Record sound before the notice update so a status that arrives in the
        // same turn cannot show a banner we are already clearing.
        heardSound.current.add(source);
        setNotices((prev) =>
          clearSilenceOnSound(prev, dismissedNotices.current, heardSound.current, source),
        );
      };

      const unlistenMicLevel = await listen<MicLevelPayload>(
        EVENT_TRANSCRIPTION_MIC_LEVEL,
        (event) => hideSilenceWhenSound("mic", event.payload.rms),
      );
      if (cancelled) {
        unlistenMicLevel();
        return;
      }
      unlisteners.push(unlistenMicLevel);

      const unlistenSystemLevel = await listen<MicLevelPayload>(
        EVENT_TRANSCRIPTION_SYSTEM_LEVEL,
        (event) => hideSilenceWhenSound("system", event.payload.rms),
      );
      if (cancelled) {
        unlistenSystemLevel();
        return;
      }
      unlisteners.push(unlistenSystemLevel);

      unlistenRefs.current = unlisteners;
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  const start = useCallback(
    async (
      source: AudioSource,
      backend: AsrBackend = "local",
      context?: string | null,
    ) => {
      if (startInFlight.current) return false;
      startInFlight.current = true;
      dismissedNotices.current.clear();
      heardSound.current.clear();
      setNotices([]);
      setIsLoading(true);
      setSegments([]);
      setSessionSource(source);
      setSessionBackend(backend);
      try {
        await invoke("start_transcription", {
          source,
          backend,
          ...(context ? { context } : {}),
        });
        return true;
      } catch (e) {
        setIsLoading(false);
        setSessionSource(null);
        setSessionBackend(null);
        setNotices((prev) =>
          addCaptureNotice(prev, dismissedNotices.current, heardSound.current, String(e)),
        );
        return false;
      } finally {
        startInFlight.current = false;
      }
    },
    [],
  );

  const stop = useCallback(async (): Promise<string | null> => {
    setIsStopping(true);
    try {
      const exported = await invoke<{ meetingId?: string }>("stop_transcription");
      setIsStopping(false);
      setIsActive(false);
      setIsLoading(false);
      return exported.meetingId ?? null;
    } catch (e) {
      setIsStopping(false);
      setNotices((prev) =>
        addCaptureNotice(prev, dismissedNotices.current, heardSound.current, String(e)),
      );
      throw e;
    }
  }, []);

  const clear = useCallback(() => {
    setSegments([]);
  }, []);

  const dismissNotice = useCallback((id: string) => {
    dismissedNotices.current.add(id);
    setNotices((prev) => prev.filter((notice) => notice.id !== id));
  }, []);

  return {
    segments,
    isActive,
    isLoading,
    isStopping,
    error: notices[0]?.message ?? null,
    notices,
    dismissNotice,
    model,
    sessionSource,
    sessionBackend,
    start,
    stop,
    clear,
  };
}
