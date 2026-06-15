import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AudioSource,
  TranscriptionModel,
  TranscriptSegment,
  TranscriptPayload,
  TranscriptionStatusPayload,
} from "../lib/transcript-types";
import {
  EVENT_TRANSCRIPT_COMMIT,
  EVENT_TRANSCRIPT_PARTIAL,
  EVENT_TRANSCRIPTION_STATUS,
} from "../lib/tauri-events";

const MODEL_STORAGE_KEY = "transcription-model";

export function useTranscription() {
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [models, setModels] = useState<TranscriptionModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadModels = async () => {
      try {
        const listed = await invoke<TranscriptionModel[]>(
          "list_transcription_models"
        );
        if (cancelled) return;
        setModels(listed);

        const saved = localStorage.getItem(MODEL_STORAGE_KEY);
        const savedModel = listed.find((m) => m.id === saved);
        const defaultModel =
          savedModel ??
          listed.find((m) => m.available) ??
          listed[0] ??
          null;

        if (defaultModel) {
          setSelectedModelId(defaultModel.id);
          if (saved !== defaultModel.id) {
            localStorage.setItem(MODEL_STORAGE_KEY, defaultModel.id);
          }
          await invoke("set_transcription_model", { model: defaultModel.id });
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e));
        }
      }
    };

    loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      const unlistenPartial = await listen<TranscriptPayload>(
        EVENT_TRANSCRIPT_PARTIAL,
        (event) => {
          const payload = event.payload;
          setSegments((prev) => {
            const idx = prev.findIndex(
              (s) => s.isPartial && s.id === "tentative"
            );
            const segment: TranscriptSegment = {
              id: "tentative",
              speaker: payload.speaker,
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
      if (cancelled) {
        unlistenPartial();
        return;
      }
      unlisteners.push(unlistenPartial);

      const unlistenCommit = await listen<TranscriptPayload>(
        EVENT_TRANSCRIPT_COMMIT,
        (event) => {
          const payload = event.payload;
          setSegments((prev) => {
            const withoutTentative = prev.filter(
              (s) => !(s.isPartial && s.id === "tentative")
            );

            const last = withoutTentative[withoutTentative.length - 1];
            if (last && !last.isPartial && last.speaker === payload.speaker) {
              const updated = [...withoutTentative];
              updated[updated.length - 1] = {
                ...last,
                text: last.text + " " + payload.text,
              };
              return updated;
            }

            return [
              ...withoutTentative,
              {
                id: payload.segmentId,
                speaker: payload.speaker,
                text: payload.text,
                isPartial: false,
                startMs: payload.startMs,
              },
            ];
          });
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

  const selectModel = useCallback(async (id: string) => {
    setSelectedModelId(id);
    localStorage.setItem(MODEL_STORAGE_KEY, id);
    try {
      await invoke("set_transcription_model", { model: id });
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const start = useCallback(
    async (source: AudioSource) => {
      setError(null);
      setIsLoading(true);
      try {
        await invoke("start_transcription", {
          source,
          model: selectedModelId,
        });
      } catch (e) {
        setIsLoading(false);
        setError(String(e));
      }
    },
    [selectedModelId]
  );

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

  const selectedModel =
    models.find((m) => m.id === selectedModelId) ?? null;

  return {
    segments,
    isActive,
    isLoading,
    error,
    model,
    models,
    selectedModelId,
    selectedModel,
    selectModel,
    start,
    stop,
    clear,
  };
}
