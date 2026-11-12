import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DEVICE_CHOICE_STORAGE_KEY,
  effectiveChoice,
  emptyDeviceList,
  parseStoredChoice,
} from "../lib/audio-device-menu";
import { EVENT_TRANSCRIPTION_DEVICES_CHANGED } from "../lib/tauri-events";
import type { AudioDeviceChoice, AudioDeviceList } from "../lib/transcript-types";

function loadChoice(): AudioDeviceChoice {
  try {
    return parseStoredChoice(localStorage.getItem(DEVICE_CHOICE_STORAGE_KEY));
  } catch {
    return { input: null, output: null };
  }
}

/**
 * The devices the user can capture from, and which ones they picked.
 * The pick is saved locally, sent to the backend, and applied live when a
 * session is running.
 */
export function useAudioDevices() {
  const [devices, setDevices] = useState<AudioDeviceList>(emptyDeviceList);
  const [choice, setChoice] = useState<AudioDeviceChoice>(loadChoice);
  const [error, setError] = useState<string | null>(null);
  const choiceRef = useRef(choice);
  choiceRef.current = choice;

  const push = useCallback(async (next: AudioDeviceChoice) => {
    try {
      await invoke("set_audio_devices", { input: next.input, output: next.output });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      setDevices(await invoke<AudioDeviceList>("list_audio_devices_command"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    void refresh();
    // The backend forgets the pick on restart; tell it what we saved.
    void push(choiceRef.current);
    const unlisten = listen(EVENT_TRANSCRIPTION_DEVICES_CHANGED, () => {
      if (mounted) void refresh();
    });
    return () => {
      mounted = false;
      void unlisten.then((fn) => fn());
    };
  }, [push, refresh]);

  const choose = useCallback(
    (side: keyof AudioDeviceChoice, id: string | null) => {
      const next = { ...choiceRef.current, [side]: id };
      setChoice(next);
      try {
        localStorage.setItem(DEVICE_CHOICE_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Private mode or blocked storage: the pick just won't survive a restart.
      }
      void push(next);
    },
    [push],
  );

  return {
    devices,
    choice: {
      input: effectiveChoice(choice.input, devices.inputs),
      output: effectiveChoice(choice.output, devices.outputs),
    },
    error,
    refresh,
    chooseInput: (id: string | null) => choose("input", id),
    chooseOutput: (id: string | null) => choose("output", id),
  };
}
