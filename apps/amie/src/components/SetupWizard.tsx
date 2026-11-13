import { useCallback, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSpeechModelDownload } from "../hooks/useSpeechModelDownload";
import { cn } from "../lib/cn";
import { EXPECTED_MODEL_SIZE_BYTES, type SpeechModelStatus } from "../lib/onboarding";
import {
  WIZARD_NUMBERED_STEPS,
  downloadedMegabytes,
  microphoneStepState,
  previousWizardStep,
  totalMegabytes,
  wizardStepNumber,
  type WizardStep,
} from "../lib/setup-wizard";
import { HeroWave } from "./HeroWave";

type SetupWizardProps = {
  step: WizardStep;
  onStepChange: (step: WizardStep) => void;
  /** Called after the last built step. Steps 3–6 of the design come later. */
  onFinish: () => void;
};

/** First-run setup on Home ("B · Setup wizard" in Paper), steps 0–2. */
export function SetupWizard({ step, onStepChange, onFinish }: SetupWizardProps) {
  const back = previousWizardStep(step);
  const model = useSpeechModelDownload();

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-10">
      {back ? (
        <button
          type="button"
          className="absolute top-[22px] left-7 flex cursor-pointer items-center gap-1.5 text-[13px] leading-[19px] font-medium text-text-secondary hover:text-text-primary"
          onClick={() => onStepChange(back)}
        >
          <Icon size={14}>
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </Icon>
          Back
        </button>
      ) : null}

      {step === "welcome" ? <WelcomeStep onNext={() => onStepChange("model")} /> : null}
      {step === "model" ? <ModelStep onNext={() => onStepChange("microphone")} /> : null}
      {step === "microphone" ? <MicrophoneStep onNext={onFinish} /> : null}

      {step === "microphone" ? <BackgroundModelStatus model={model} /> : null}
    </main>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <section className="flex flex-col items-center text-center" aria-labelledby="wizard-title">
      <HeroWave />
      <h1
        id="wizard-title"
        className="mt-7 max-w-[720px] text-[46px] leading-[52px] font-[650] tracking-[-0.03em] text-text-primary"
      >
        Amie listens to your calls and keeps notes for you.
      </h1>
      <p className="mt-3.5 max-w-[560px] text-[16px] leading-6 text-text-secondary">
        Live transcript while you talk. A clean summary when you hang up. Everything is
        transcribed on this Mac.
      </p>
      <PrimaryButton
        className="mt-[30px] h-[54px] rounded-xl px-[30px] text-[16px] leading-5 font-[650]"
        onClick={onNext}
      >
        Get started
        <ArrowRight size={17} />
      </PrimaryButton>
      <p className="mt-[18px] flex items-center gap-1.5 text-[13px] leading-[19px] text-text-muted">
        <Icon size={14}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </Icon>
        Takes about 2 minutes
      </p>
    </section>
  );
}

function ModelStep({ onNext }: { onNext: () => void }) {
  const model = useSpeechModelDownload();
  const [status, setStatus] = useState<SpeechModelStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<SpeechModelStatus>("get_speech_model_status")
      .then(setStatus)
      .catch((e) => setError(String(e)));
  }, []);

  const totalBytes = status?.expectedSizeBytes ?? EXPECTED_MODEL_SIZE_BYTES;
  const totalMb = totalMegabytes(totalBytes);
  const percent = model.ready ? 100 : (model.percent ?? 0);
  const helperMissing = status?.helperFound === false;
  const started = model.downloading || model.ready;

  const download = async () => {
    setStarting(true);
    setError(null);
    try {
      setStatus(await invoke<SpeechModelStatus>("start_speech_model_download"));
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <StepLayout
      step="model"
      title="Download the speech model"
      copy={`Amie transcribes on this Mac with a local speech model (${totalMb} MB). Nothing leaves your device, and nothing downloads until you click Download.`}
    >
      <div className="mt-7 flex w-full flex-col gap-2.5 rounded-xl border border-border-default bg-surface-content px-[18px] py-4">
        <div className="flex w-full items-center gap-3">
          <span className="flex-1 text-[14px] leading-5 font-semibold text-text-primary">
            {model.ready ? "Downloaded" : model.downloading ? "Downloading" : "Not downloaded yet"}
          </span>
          <span className="text-[13px] leading-[19px] text-text-secondary">
            {model.downloading
              ? `${downloadedMegabytes(percent, totalBytes)} of ${totalMb} MB`
              : `${totalMb} MB`}
          </span>
          {started ? (
            <span className="text-[13px] leading-[19px] font-[650] text-text-brand">
              {percent}%
            </span>
          ) : null}
        </div>
        {started ? (
          <>
            <ProgressTrack percent={percent} className="h-1.5 rounded-sm" />
            <p className="flex items-center gap-2 text-[13px] leading-[19px] text-text-secondary">
              <Check size={13} />
              {model.ready
                ? "The speech model is on this Mac."
                : "Download started. It keeps going if you move on or close this window."}
            </p>
          </>
        ) : null}
      </div>

      {helperMissing ? (
        <p className="mt-3 text-[13px] leading-[19px] text-text-secondary">
          The speech helper is missing. Run <code>./scripts/setup-nemotron.sh</code> once,
          then try again.
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-[13px] leading-[19px] text-status-danger-text" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3.5">
        {started ? (
          <PrimaryButton onClick={onNext}>
            Continue
            <ArrowRight size={16} />
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void download()} disabled={starting || helperMissing}>
            {starting ? "Starting…" : "Download"}
          </PrimaryButton>
        )}
        <span className="text-[13px] leading-[19px] text-text-muted">
          {started ? "Next: let Amie hear your microphone" : `About ${totalMb} MB`}
        </span>
      </div>
    </StepLayout>
  );
}

type SystemAccessStatus = { microphone: string };

function MicrophoneStep({ onNext }: { onNext: () => void }) {
  const [authorization, setAuthorization] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = microphoneStepState(authorization);

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<SystemAccessStatus>("get_system_access_status");
      setAuthorization(next.microphone);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  // macOS answers outside the app (prompt or System Settings): re-check on focus and every 1.5s.
  useEffect(() => {
    void refresh();
    if (state === "allowed") return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh, state]);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      const next = await invoke<SystemAccessStatus>(
        state === "denied" ? "open_system_access_settings" : "request_microphone_permission",
        state === "denied" ? { pane: "microphone" } : undefined,
      );
      setAuthorization(next.microphone);
    } catch (e) {
      setError(String(e));
    } finally {
      setAsking(false);
    }
  };

  return (
    <StepLayout
      step="microphone"
      title="So Amie can hear your side of the call."
      copy="macOS will ask for permission. Amie only listens during meetings you start."
    >
      <div className="mt-7 flex items-center gap-3.5">
        {state === "allowed" ? (
          <PrimaryButton onClick={onNext}>
            Continue
            <ArrowRight size={16} />
          </PrimaryButton>
        ) : (
          <>
            <PrimaryButton className="px-[22px]" onClick={() => void ask()} disabled={asking}>
              <Icon size={16}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </Icon>
              {state === "denied" ? "Open System Settings" : "Allow microphone"}
            </PrimaryButton>
            <span className="text-[12.5px] leading-[18px] text-text-muted">
              {state === "denied" ? "Turn on Amie under Microphone" : "Shows the macOS prompt"}
            </span>
          </>
        )}
      </div>

      <p className="mt-5 flex items-center gap-2 text-[13px] leading-[19px] text-text-secondary">
        {state === "allowed" ? (
          <span className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-brand-on-primary">
            <Icon size={10} strokeWidth={3}>
              <path d="M20 6 9 17l-5-5" />
            </Icon>
          </span>
        ) : (
          <span className="flex size-4 items-center justify-center rounded-md border-[1.5px] border-status-danger bg-status-danger-bg">
            <span className="size-[5px] rounded-[3px] bg-status-danger" />
          </span>
        )}
        {state === "allowed" ? "Allowed" : state === "denied" ? "Not allowed" : "Not allowed yet"}
      </p>
      {error ? (
        <p className="mt-3 text-[13px] leading-[19px] text-status-danger-text" role="alert">
          {error}
        </p>
      ) : null}
    </StepLayout>
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
          <Check size={13} />
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

function StepLayout({
  step,
  title,
  copy,
  children,
}: {
  step: WizardStep;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  const number = wizardStepNumber(step) ?? 0;
  return (
    <section className="flex w-[560px] max-w-full flex-col items-start" aria-labelledby="wizard-title">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {Array.from({ length: WIZARD_NUMBERED_STEPS }, (_, i) => (
          <span
            key={i}
            className={cn(
              "h-1 w-11 shrink-0 rounded-[2px]",
              i + 1 < number
                ? "bg-brand-accent"
                : i + 1 === number
                  ? "bg-brand-speaker-user"
                  : "bg-border-default",
            )}
          />
        ))}
      </div>
      <p className="mt-3.5 text-[12px] leading-[17px] font-semibold tracking-[0.08em] text-text-secondary uppercase">
        Step {number} of {WIZARD_NUMBERED_STEPS}
      </p>
      <h1
        id="wizard-title"
        className="mt-1.5 text-[34px] leading-10 font-[650] tracking-[-0.025em] text-text-primary"
      >
        {title}
      </h1>
      <p className="mt-3 max-w-[500px] text-[15px] leading-[22px] text-text-secondary">{copy}</p>
      {children}
    </section>
  );
}

function PrimaryButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-brand-primary bg-brand-primary px-[26px] text-[14px] leading-[18px] font-[550] text-brand-on-primary enabled:hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ProgressTrack({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={cn("block w-full overflow-hidden bg-surface-muted", className)}>
      <span
        className="block h-full rounded-[inherit] bg-brand-accent transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </span>
  );
}

function Icon({
  size,
  strokeWidth = 2,
  children,
}: {
  size: number;
  strokeWidth?: number;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function ArrowRight({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

function Check({ size }: { size: number }) {
  return (
    <span className="text-text-brand">
      <Icon size={size} strokeWidth={3}>
        <path d="M20 6 9 17l-5-5" />
      </Icon>
    </span>
  );
}
