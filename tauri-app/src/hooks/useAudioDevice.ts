import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AudioDeviceInfo, AudioDevicePayload } from "../lib/transcript-types";
import { EVENT_TRANSCRIPTION_DEVICE } from "../lib/tauri-events";

export function useAudioDevice() {
  const [device, setDevice] = useState<AudioDeviceInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadDevice = async () => {
      try {
        const info = await invoke<AudioDeviceInfo>("get_default_input_device_command");
        if (mounted) {
          setDevice(info);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    loadDevice();

    const unlisten = listen<AudioDevicePayload>(EVENT_TRANSCRIPTION_DEVICE, (event) => {
      if (!mounted) return;
      setDevice(event.payload.device);
      setError(null);
    });

    return () => {
      mounted = false;
      unlisten.then((fn) => fn());
    };
  }, []);

  return { device, error };
}
