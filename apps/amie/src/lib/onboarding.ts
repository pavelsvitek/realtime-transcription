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
  downloadPercent: number | null;
  expectedSizeBytes: number;
  helperFound: boolean;
};

export type SpeechModelDownloadProgress = {
  downloading: boolean;
  percent: number;
  stage: string;
  ready: boolean;
};

export function hasSeenOnboarding(): boolean {
  return localStorage.getItem(ONBOARDING_SEEN_STORAGE_KEY) === "1";
}

/**
 * Show onboarding when:
 * - `--show-onboarding` / `AMIE_SHOW_ONBOARDING` forces it, or
 * - the speech model is not on disk yet (every launch until downloaded), or
 * - the user has never completed/dismissed the flow while the model was ready.
 */
export function shouldShowOnboarding(options: {
  force: boolean;
  modelReady: boolean;
  seen: boolean;
}): boolean {
  if (options.force) return true;
  if (!options.modelReady) return true;
  return !options.seen;
}

/**
 * Mark onboarding as seen so it does not show again once the model is ready.
 * Called when the user finishes step 2 (Done) or dismisses early.
 * If the model is still missing, the dialog still reopens on the next launch.
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

/** Footer status while the speech model downloads in the background. */
export function downloadFooterStatus(percent: number | null | undefined): string {
  const value = typeof percent === "number" ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
  return `Downloading speech model… ${value}%`;
}

export const MODEL_STILL_DOWNLOADING_USER_MESSAGE =
  "The transcription model is still being downloaded. Check the progress in footer.";

/** Soften raw Nemotron install errors while a download is in progress. */
export function formatTranscriptionError(
  error: string,
  downloading: boolean,
): string {
  if (
    downloading &&
    /Failed to load model|setup-nemotron|model component|model bundle not found/i.test(
      error,
    )
  ) {
    return MODEL_STILL_DOWNLOADING_USER_MESSAGE;
  }
  return error;
}
