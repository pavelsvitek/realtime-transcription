/** Setup wizard on Home ("B · Setup wizard" in Paper). Only steps 0–2 exist so far. */
export type WizardStep = "welcome" | "model" | "microphone";

/** Numbered steps in the full design (model, microphone, system audio, summaries, speaker names). */
export const WIZARD_NUMBERED_STEPS = 5;

/** 1-based number shown as "Step n of 5"; Welcome has none. */
export function wizardStepNumber(step: WizardStep): number | null {
  if (step === "model") return 1;
  if (step === "microphone") return 2;
  return null;
}

export function previousWizardStep(step: WizardStep): WizardStep | null {
  if (step === "model") return "welcome";
  if (step === "microphone") return "model";
  return null;
}

const MB = 1024 * 1024;

/** Megabytes downloaded so far, from the progress percent and the expected size. */
export function downloadedMegabytes(percent: number, totalBytes: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return Math.round(((clamped / 100) * totalBytes) / MB);
}

export function totalMegabytes(totalBytes: number): number {
  return Math.round(totalBytes / MB);
}

export type MicrophoneStepState = "allowed" | "ask" | "denied";

/**
 * What the microphone step offers: the macOS prompt while access was never
 * asked for, System Settings once it was refused, Continue once allowed.
 */
export function microphoneStepState(authorization: string | null | undefined): MicrophoneStepState {
  if (authorization === "authorized") return "allowed";
  if (authorization === "denied" || authorization === "restricted") return "denied";
  return "ask";
}
