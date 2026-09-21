import { useEffect, useRef, useState } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { MicLevelPayload } from "../lib/transcript-types";
import { EVENT_TRANSCRIPTION_MIC_LEVEL } from "../lib/tauri-events";

const RMS_THRESHOLD = 0.01;
const DEBOUNCE_MS = 300;

export function useMicLevel(isActive: boolean) {
  const [micActive, setMicActive] = useState(false);
  const lastAboveRef = useRef(0);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    if (!isActive) {
      setMicActive(false);
      return;
    }

    let mounted = true;

    const setup = async () => {
      unlistenRef.current = await listen<MicLevelPayload>(
        EVENT_TRANSCRIPTION_MIC_LEVEL,
        (event) => {
          if (!mounted) return;
          const now = Date.now();
          if (event.payload.rms > RMS_THRESHOLD) {
            lastAboveRef.current = now;
            setMicActive(true);
          } else if (now - lastAboveRef.current > DEBOUNCE_MS) {
            setMicActive(false);
          }
        }
      );
    };

    setup();

    return () => {
      mounted = false;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [isActive]);

  return micActive;
}
