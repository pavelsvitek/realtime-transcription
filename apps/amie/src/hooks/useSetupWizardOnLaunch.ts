import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hasSeenOnboarding,
  shouldShowOnboarding,
  type LaunchFlags,
  type SpeechModelStatus,
} from "../lib/onboarding";

/**
 * Whether Home opens on the setup wizard at launch: forced by
 * `--onboarding-flow`, or while the speech model is missing, or until setup
 * was finished once. Null until decided; false when it cannot be read.
 */
export function useSetupWizardOnLaunch(): boolean | null {
  const [show, setShow] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<LaunchFlags>("get_launch_flags"),
      invoke<SpeechModelStatus>("get_speech_model_status"),
    ])
      .then(([flags, model]) => {
        if (cancelled) return;
        setShow(
          shouldShowOnboarding({
            force: flags.onboardingFlow,
            modelReady: model.ready,
            seen: hasSeenOnboarding(),
          }),
        );
      })
      .catch((error) => {
        console.warn("Failed to decide on the setup wizard", error);
        if (!cancelled) setShow(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return show;
}
