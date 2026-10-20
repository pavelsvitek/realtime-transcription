/**
 * Same cutoff as the backend silence warning (`SILENCE_RMS_THRESHOLD` in the
 * transcription worker) and the red mic icon.
 */
export const SPEECH_RMS_THRESHOLD = 0.01;

/** True when a capture level is loud enough to count as sound. */
export function rmsIndicatesSound(rms: number): boolean {
  return Number.isFinite(rms) && rms > SPEECH_RMS_THRESHOLD;
}
