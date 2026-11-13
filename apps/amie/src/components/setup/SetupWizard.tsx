import { useState } from "react";
import { useSpeechModelDownload } from "../../hooks/useSpeechModelDownload";
import {
  previousWizardStep,
  stepAfter,
  type SystemAudioTestResult,
  type WizardStep,
} from "../../lib/setup-wizard";
import { MicrophoneStep } from "./MicrophoneStep";
import { ModelStep } from "./ModelStep";
import { ReadyStep } from "./ReadyStep";
import { SpeakersStep } from "./SpeakersStep";
import { SummariesStep } from "./SummariesStep";
import { SystemAudioStep } from "./SystemAudioStep";
import { Check, Icon, ProgressTrack } from "./ui";
import { WelcomeStep } from "./WelcomeStep";

type SetupWizardProps = {
  step: WizardStep;
  onStepChange: (step: WizardStep) => void;
  /** Start a meeting on the last step; the wizard ends with it. */
  onStartMeeting: () => void;
};

/** First-run setup on Home ("B · Setup wizard" in Paper). */
export function SetupWizard({ step, onStepChange, onStartMeeting }: SetupWizardProps) {
  const model = useSpeechModelDownload();
  // Kept here so Back and the Ready recap remember the sound test.
  const [systemAudio, setSystemAudio] = useState<SystemAudioTestResult>(null);
  // Set when a step is opened from the recap: Continue, Skip and Back lead back to it.
  const [returnToReady, setReturnToReady] = useState(false);
  const back = returnToReady && step !== "ready" ? "ready" : previousWizardStep(step);

  const goTo = (target: WizardStep) => {
    if (target === "ready") setReturnToReady(false);
    onStepChange(target);
  };
  const next = () => {
    const following = stepAfter(step, returnToReady);
    if (following) goTo(following);
  };
  const revisit = (target: WizardStep) => {
    setReturnToReady(true);
    onStepChange(target);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Anchored at the top so the step bars and titles stay put between steps of different heights. */}
      <main className="relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-10 pt-28 pb-12">
        {back ? (
          <button
            type="button"
            className="absolute top-[22px] left-7 flex cursor-pointer items-center gap-1.5 text-[13px] leading-[19px] font-medium text-text-secondary hover:text-text-primary"
            onClick={() => goTo(back)}
          >
            <Icon size={14}>
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </Icon>
            Back
          </button>
        ) : null}

        {step === "welcome" ? <WelcomeStep onNext={next} /> : null}
        {step === "model" ? <ModelStep onNext={next} /> : null}
        {step === "microphone" ? <MicrophoneStep onNext={next} /> : null}
        {step === "systemAudio" ? (
          <SystemAudioStep result={systemAudio} onResult={setSystemAudio} onNext={next} />
        ) : null}
        {step === "summaries" ? <SummariesStep onNext={next} /> : null}
        {step === "speakers" ? <SpeakersStep onNext={next} /> : null}
        {step === "ready" ? (
          <ReadyStep systemAudio={systemAudio} onGoTo={revisit} onStartMeeting={onStartMeeting} />
        ) : null}
      </main>
      <ModelStatusFooter model={model} />
    </div>
  );
}

/** Footer under the wizard, like the Transcription page's: where the speech model download stands. */
function ModelStatusFooter({ model }: { model: ReturnType<typeof useSpeechModelDownload> }) {
  const percent = model.percent ?? 0;
  return (
    <footer className="flex shrink-0 items-center gap-2 border-t border-border-default px-4 py-2 text-[12px] leading-[18px] text-text-muted">
      {model.ready ? (
        <>
          <Check size={12} />
          Speech model ready
        </>
      ) : model.downloading ? (
        <>
          <span className="font-medium text-text-secondary">Speech model</span>
          <ProgressTrack percent={percent} className="h-1 w-40 rounded-[4px]" />
          <span className="font-[650] text-text-brand">{percent}%</span>
          <span>downloading in the background</span>
        </>
      ) : (
        "Speech model not downloaded yet"
      )}
    </footer>
  );
}
