import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioSource,
  AsrBackend,
  TranscriptSegment,
  TranscriptPayload,
  TranscriptionStatusPayload,
} from "../lib/transcript-types";
import {
  EVENT_TRANSCRIPT_COMMIT,
  EVENT_TRANSCRIPT_PARTIAL,
  EVENT_TRANSCRIPTION_STATUS,
} from "../lib/tauri-events";
import { restoreLiveTranscription } from "../lib/restore-live-transcription";
import { applyTranscriptEvent, finalizePartials } from "../lib/transcript-timeline";

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<AudioSource | null>(null);
  const [sessionBackend, setSessionBackend] = useState<AsrBackend | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

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
          setSegments(restored.segments);
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
          setError(payload.error ?? null);
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

      unlistenRefs.current = unlisteners;
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  const start = useCallback(async (source: AudioSource, backend: AsrBackend = "local") => {
    setError(null);
    setIsLoading(true);
    setSegments([]);
    setSessionSource(source);
    setSessionBackend(backend);
    try {
      await invoke("start_transcription", {
        source,
        backend,
      });
    } catch (e) {
      setIsLoading(false);
      setSessionSource(null);
      setSessionBackend(null);
      setError(String(e));
    }
  }, []);

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
      setError(String(e));
      throw e;
    }
  }, []);

  const clear = useCallback(() => {
    setSegments([]);
  }, []);

  return {
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
  };
}
