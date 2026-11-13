import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LaunchFlags } from "../lib/onboarding";

/** Command-line launch flags; null until loaded, all off when they cannot be read. */
export function useLaunchFlags(): LaunchFlags | null {
  const [flags, setFlags] = useState<LaunchFlags | null>(null);
  useEffect(() => {
    let cancelled = false;
    invoke<LaunchFlags>("get_launch_flags")
      .then((next) => {
        if (!cancelled) setFlags(next);
      })
      .catch((error) => {
        console.warn("Failed to read launch flags", error);
        if (!cancelled) setFlags({ showOnboarding: false, onboardingFlow: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return flags;
}
