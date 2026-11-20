import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LaunchFlags } from "../lib/onboarding";

let cached: Promise<boolean> | null = null;

/** Launch flags never change while the app runs, so read them once. */
function readDeveloperMode(): Promise<boolean> {
  cached ??= invoke<LaunchFlags>("get_launch_flags")
    .then((flags) => flags.developerMode === true)
    .catch((error) => {
      console.warn("Failed to read launch flags", error);
      return false;
    });
  return cached;
}

/** True when Amie was started with `--developer-mode`; false until known. */
export function useDeveloperMode(): boolean {
  const [developerMode, setDeveloperMode] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readDeveloperMode().then((value) => {
      if (!cancelled) setDeveloperMode(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return developerMode;
}
