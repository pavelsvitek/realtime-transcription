import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TranscriptSegment,
  TranscriptPayload,
  TranscriptionStatusPayload,
} from "../lib/transcript-types";

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    const setup = async () => {
      const unlistenPartial = await listen<TranscriptPayload>(
        "transcript.partial",
        (event) => {
          const payload = event.payload;
          setSegments((prev) => {
            const idx = prev.findIndex(
              (s) => s.isPartial && s.id === "tentative"
            );
            const segment: TranscriptSegment = {
              id: "tentative",
              speaker: "User",
              text: payload.text,
              isPartial: true,
              startMs: payload.startMs,
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = segment;
              return next;
            }
            return [...prev, segment];
          });
        }
      );

      const unlistenCommit = await listen<TranscriptPayload>(
        "transcript.commit",
        (event) => {
          const payload = event.payload;
          setSegments((prev) => {
            const withoutTentative = prev.filter(
              (s) => !(s.isPartial && s.id === "tentative")
            );
            return [
              ...withoutTentative,
              {
                id: payload.segmentId,
                speaker: "User",
                text: payload.text,
                isPartial: false,
                startMs: payload.startMs,
              },
            ];
          });
        }
      );

      const unlistenStatus = await listen<TranscriptionStatusPayload>(
        "transcription.status",
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

      unlistenRefs.current = [
        unlistenPartial,
        unlistenCommit,
        unlistenStatus,
      ];
    };

    setup();

    return () => {
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      await invoke("start_transcription");
    } catch (e) {
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

  return { segments, isActive, isLoading, error, model, start, stop, clear };
}
