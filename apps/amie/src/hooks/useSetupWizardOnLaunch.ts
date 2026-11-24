import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  hasSeenOnboarding,
  isReturningModelUpgrade,
  shouldShowOnboarding,
  type LaunchFlags,
  type SpeechModelStatus,
} from "../lib/onboarding";

export type LaunchWizardDecision = {
  show: boolean;
  /** Existing user who already finished setup and only needs the new model. */
  modelUpgradeOnly: boolean;
};

/**
 * Whether Home opens on the setup wizard at launch: forced by
 * `--onboarding-flow`, or while the speech model is missing, or until setup
 * was finished once. Null until decided; `{ show: false }` on error.
 */
export function useSetupWizardOnLaunch(): LaunchWizardDecision | null {
  const [decision, setDecision] = useState<LaunchWizardDecision | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      invoke<LaunchFlags>("get_launch_flags"),
      invoke<SpeechModelStatus>("get_speech_model_status"),
    ])
      .then(([flags, model]) => {
        if (cancelled) return;
        const options = {
          force: flags.onboardingFlow,
          modelReady: model.ready,
          seen: hasSeenOnboarding(),
        };
        setDecision({
          show: shouldShowOnboarding(options),
          modelUpgradeOnly: isReturningModelUpgrade(options),
        });
      })
      .catch((error) => {
        console.warn("Failed to decide on the setup wizard", error);
        if (!cancelled) setDecision({ show: false, modelUpgradeOnly: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return decision;
}
