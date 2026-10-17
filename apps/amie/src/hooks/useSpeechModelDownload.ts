import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { EVENT_SPEECH_MODEL_DOWNLOAD_PROGRESS } from "../lib/tauri-events";
import type {
  SpeechModelDownloadProgress,
  SpeechModelStatus,
} from "../lib/onboarding";

export type SpeechModelDownloadView = {
  downloading: boolean;
  percent: number | null;
  ready: boolean;
};

/**
 * Tracks background speech-model download progress for the page footer
 * (and any other listener). Seeds from get_speech_model_status, then
 * follows speech-model/download-progress events.
 */
export function useSpeechModelDownload(): SpeechModelDownloadView {
  const [view, setView] = useState<SpeechModelDownloadView>({
    downloading: false,
    percent: null,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;

    void (async () => {
      try {
        const status = await invoke<SpeechModelStatus>("get_speech_model_status");
        if (cancelled) return;
        setView({
          downloading: status.downloading,
          percent: status.downloadPercent,
          ready: status.ready,
        });
      } catch (error) {
        console.warn("Failed to load speech model status", error);
      }

      try {
        unlisten = await listen<SpeechModelDownloadProgress>(
          EVENT_SPEECH_MODEL_DOWNLOAD_PROGRESS,
          (event) => {
            setView({
              downloading: event.payload.downloading,
              percent: event.payload.percent,
              ready: event.payload.ready,
            });
          },
        );
        if (cancelled) {
          unlisten();
        }
      } catch (error) {
        console.warn("Failed to listen for speech model download progress", error);
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return view;
}
