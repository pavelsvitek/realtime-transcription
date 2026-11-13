/** Setup wizard on Home ("B · Setup wizard" in Paper). */
export type WizardStep =
  | "welcome"
  | "model"
  | "microphone"
  | "systemAudio"
  | "summaries"
  | "speakers"
  | "ready";

export const WIZARD_STEPS: WizardStep[] = [
  "welcome",
  "model",
  "microphone",
  "systemAudio",
  "summaries",
  "speakers",
  "ready",
];

/** Numbered steps: model, microphone, system audio, summaries, speaker names. */
export const WIZARD_NUMBERED_STEPS = 5;

/** 1-based number shown as "Step n of 5"; Welcome and Ready have none. */
export function wizardStepNumber(step: WizardStep): number | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index >= 1 && index <= WIZARD_NUMBERED_STEPS ? index : null;
}

/** Summaries and speaker names can be skipped. */
export function isOptionalStep(step: WizardStep): boolean {
  return step === "summaries" || step === "speakers";
}

export function nextWizardStep(step: WizardStep): WizardStep | null {
  return WIZARD_STEPS[WIZARD_STEPS.indexOf(step) + 1] ?? null;
}

/** Back goes one step; Welcome and Ready have no Back. */
export function previousWizardStep(step: WizardStep): WizardStep | null {
  if (step === "welcome" || step === "ready") return null;
  return WIZARD_STEPS[WIZARD_STEPS.indexOf(step) - 1] ?? null;
}

/** The background model bar shows on the steps after the download step. */
export function showsBackgroundModelStatus(step: WizardStep): boolean {
  const index = WIZARD_STEPS.indexOf(step);
  return index >= WIZARD_STEPS.indexOf("microphone") && index <= WIZARD_STEPS.indexOf("speakers");
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

export type SummaryProviderId = "xai" | "openai" | "gemini";

export const SUMMARY_PROVIDERS: {
  id: SummaryProviderId;
  label: string;
  keyUrl: string;
  recommended?: boolean;
}[] = [
  { id: "xai", label: "xAI", keyUrl: "https://console.x.ai", recommended: true },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
];

export function summaryProviderLabel(id: string | null | undefined): string {
  return SUMMARY_PROVIDERS.find((provider) => provider.id === id)?.label ?? "";
}

/** Which providers already have a key (saved on this Mac or from the environment). */
export type ProviderKeys = Record<SummaryProviderId, boolean>;

export type SystemAudioTestResult = "heard" | "silent" | null;

export type ReadyRow = {
  label: string;
  done: boolean;
  /** Short note on the right of a finished row ("tested", "xAI"). */
  detail?: string;
  /** Where "Finish later" goes for an unfinished row. */
  step: WizardStep;
};

/** The recap on the last step, from what the app knows now. */
export function readyRows(state: {
  modelReady: boolean;
  modelDownloading: boolean;
  microphoneAllowed: boolean;
  systemAudio: SystemAudioTestResult;
  summaryProvider: SummaryProviderId | null;
  providerKeys: ProviderKeys;
  accessibilityAllowed: boolean;
  meetConnected: boolean;
}): ReadyRow[] {
  const provider = state.summaryProvider;
  const summariesDone = provider !== null && state.providerKeys[provider];
  return [
    {
      label: "Speech model",
      done: state.modelReady,
      detail: state.modelReady ? undefined : state.modelDownloading ? "downloading" : undefined,
      step: "model",
    },
    { label: "Microphone", done: state.microphoneAllowed, step: "microphone" },
    {
      label: "System audio",
      done: state.systemAudio === "heard",
      detail: state.systemAudio === "heard" ? "tested" : undefined,
      step: "systemAudio",
    },
    {
      label: "Summaries",
      done: summariesDone,
      detail: summariesDone ? summaryProviderLabel(provider) : undefined,
      step: "summaries",
    },
    {
      label: "Speaker names",
      done: state.accessibilityAllowed,
      detail: state.accessibilityAllowed ? "Zoom & Teams" : undefined,
      step: "speakers",
    },
    { label: "Google Meet speaker names", done: state.meetConnected, step: "speakers" },
  ];
}
