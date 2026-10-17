/** Same localStorage prefs pattern as ASR backend and color scheme. */
export const ONBOARDING_SEEN_STORAGE_KEY = "amie-onboarding-seen";

/** Approximate CoreML INT8 speech model size (MODEL_INVESTIGATION.md). */
export const EXPECTED_MODEL_SIZE_BYTES = 612 * 1024 * 1024;

export type LaunchFlags = {
  showOnboarding: boolean;
};

export type SpeechModelStatus = {
  ready: boolean;
  downloading: boolean;
  expectedSizeBytes: number;
  helperFound: boolean;
};

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "1";
}

/**
 * Mark onboarding as seen so it does not show on the next normal launch.
 * Called when the user finishes step 2 or dismisses (close / Escape / backdrop).
 */
export function markOnboardingSeen(): void {
  localStorage.setItem(ONBOARDING_SEEN_STORAGE_KEY, "1");
}

export function clearOnboardingSeen(): void {
  localStorage.removeItem(ONBOARDING_SEEN_STORAGE_KEY);
}

export function formatModelSize(bytes: number = EXPECTED_MODEL_SIZE_BYTES): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) {
    return `about ${Math.round(mb)} MB`;
  }
  return `about ${mb.toFixed(1)} MB`;
}
