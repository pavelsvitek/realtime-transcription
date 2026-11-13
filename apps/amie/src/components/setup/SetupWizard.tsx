import { useState } from "react";
import { useSpeechModelDownload } from "../../hooks/useSpeechModelDownload";
import {
  previousWizardStep,
  showsBackgroundModelStatus,
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
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-10">
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

      {showsBackgroundModelStatus(step) ? <BackgroundModelStatus model={model} /> : null}
    </main>
  );
}

/** Slim model progress pinned to the bottom of the steps after Download. */
function BackgroundModelStatus({ model }: { model: ReturnType<typeof useSpeechModelDownload> }) {
  if (!model.downloading && !model.ready) return null;
  const percent = model.percent ?? 0;
  return (
    <div className="absolute inset-x-0 bottom-7 flex items-center justify-center gap-3 text-[12.5px] leading-[18px]">
      {model.ready ? (
        <span className="flex items-center gap-2 font-medium text-text-secondary">
          <Check />
          Speech model ready
        </span>
      ) : (
        <>
          <span className="font-medium text-text-secondary">Speech model</span>
          <ProgressTrack percent={percent} className="h-1 w-[220px] rounded-[4px]" />
          <span className="font-[650] text-text-brand">{percent}%</span>
          <span className="text-text-muted">downloading in the background</span>
        </>
      )}
    </div>
  );
}
