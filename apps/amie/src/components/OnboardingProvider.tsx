import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  type LaunchFlags,
  type SpeechModelStatus,
} from "../lib/onboarding";
import { OnboardingDialog } from "./OnboardingDialog";

/**
 * Shows the first-run onboarding dialog once per install (localStorage),
 * or whenever `--show-onboarding` / `AMIE_SHOW_ONBOARDING=1` is set.
 *
 * Seen policy: mark seen when the user finishes step 2 (Done) or dismisses
 * early (Close / Not now / Escape / backdrop). Force-show still works via CLI.
 */
export function OnboardingProvider() {
  const [open, setOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<SpeechModelStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [flags, status] = await Promise.all([
          invoke<LaunchFlags>("get_launch_flags"),
          invoke<SpeechModelStatus>("get_speech_model_status"),
        ]);
        if (cancelled) return;
        setModelStatus(status);
        if (flags.showOnboarding || !hasSeenOnboarding()) {
          setOpen(true);
        }
      } catch (error) {
        console.error("Failed to decide onboarding:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const closeAndRemember = useCallback(() => {
    markOnboardingSeen();
    setOpen(false);
  }, []);

  const startDownload = useCallback(async () => {
    const next = await invoke<SpeechModelStatus>("start_speech_model_download");
    setModelStatus(next);
  }, []);

  if (!open) return null;

  return (
    <OnboardingDialog
      modelStatus={modelStatus}
      onDismiss={closeAndRemember}
      onComplete={closeAndRemember}
      onStartDownload={startDownload}
    />
  );
}
