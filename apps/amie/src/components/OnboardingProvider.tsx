import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hasSeenOnboarding,
  markOnboardingSeen,
  shouldShowOnboarding,
  type LaunchFlags,
  type SpeechModelStatus,
} from "../lib/onboarding";
import { OnboardingDialog } from "./OnboardingDialog";

/**
 * Shows the onboarding dialog when the speech model is not downloaded yet
 * (every launch until it is), on first completion while the model is ready,
 * or whenever `--show-onboarding` / `AMIE_SHOW_ONBOARDING=1` is set.
 *
 * Seen policy: mark seen on Done or dismiss. That only suppresses future
 * launches once the model is on disk; missing model still reopens every start.
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
        if (
          shouldShowOnboarding({
            force: flags.showOnboarding,
            modelReady: status.ready,
            seen: hasSeenOnboarding(),
          })
        ) {
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
