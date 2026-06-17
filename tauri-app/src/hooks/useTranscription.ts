import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioSource,
  TranscriptSegment,
  TranscriptPayload,
  TranscriptionStatusPayload,
} from "../lib/transcript-types";
import {
  EVENT_TRANSCRIPT_COMMIT,
  EVENT_TRANSCRIPT_PARTIAL,
  EVENT_TRANSCRIPTION_STATUS,
} from "../lib/tauri-events";
import { applyTranscriptEvent } from "../lib/transcript-timeline";

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
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

  const start = useCallback(async (source: AudioSource) => {
    setError(null);
    setIsLoading(true);
    try {
      await invoke("start_transcription", {
        source,
      });
    } catch (e) {
      setIsLoading(false);
      setError(String(e));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      await invoke("stop_transcription");
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const clear = useCallback(() => {
    setSegments([]);
  }, []);

  return {
    segments,
    isActive,
    isLoading,
    error,
    model,
    start,
    stop,
    clear,
  };
}
