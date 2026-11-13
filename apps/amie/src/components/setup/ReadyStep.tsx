import { useEffect, useState } from "react";
import { useSpeechModelDownload } from "../../hooks/useSpeechModelDownload";
import { cn } from "../../lib/cn";
import {
  readyRows,
  type ProviderKeys,
  type SummaryProviderId,
  type SystemAudioTestResult,
  type WizardStep,
} from "../../lib/setup-wizard";
import { loadSummarySetup } from "./SummariesStep";
import { CheckBadge, MicIcon, PrimaryButton, StepBars, TextLink } from "./ui";
import { useSystemAccess } from "./useSystemAccess";

type ReadyStepProps = {
  systemAudio: SystemAudioTestResult;
  onGoTo: (step: WizardStep) => void;
  onStartMeeting: () => void;
};

export function ReadyStep({ systemAudio, onGoTo, onStartMeeting }: ReadyStepProps) {
  const model = useSpeechModelDownload();
  const { status } = useSystemAccess(false);
  const [summary, setSummary] = useState<{ provider: SummaryProviderId; keys: ProviderKeys } | null>(
    null,
  );

  useEffect(() => {
    loadSummarySetup()
      .then((setup) => setSummary({ provider: setup.provider, keys: setup.keys }))
      .catch(() => setSummary(null));
  }, []);

  const rows = readyRows({
    modelReady: model.ready,
    modelDownloading: model.downloading,
    microphoneAllowed: status?.microphone === "authorized",
    systemAudio,
    summaryProvider: summary?.provider ?? null,
    providerKeys: summary?.keys ?? { xai: false, openai: false, gemini: false },
    accessibilityAllowed: status?.accessibility.trusted === true,
    meetConnected: status?.googleMeetExtension.connected === true,
  });

  return (
    <section className="flex w-[560px] max-w-full flex-col items-start" aria-labelledby="wizard-title">
      <StepBars current={6} />
      <h1
        id="wizard-title"
        className="mt-6 text-[46px] leading-[52px] font-[650] tracking-[-0.03em] text-text-primary"
      >
        You’re all set.
      </h1>
      <p className="mt-3 text-[16px] leading-6 text-text-secondary">
        Amie is ready to listen to your next call and keep notes for you.
      </p>

      <ul className="mt-[26px] flex w-[380px] max-w-full flex-col border-t border-border-default pt-3">
        {rows.map((row) => (
          <li key={row.label} className="flex h-9 w-full shrink-0 items-center gap-3">
            {row.done ? (
              <CheckBadge size={18} />
            ) : (
              <span
                className="size-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-border-input"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "flex-1 text-[14px] leading-5 font-medium",
                row.done ? "text-text-primary" : "text-text-secondary",
              )}
            >
              {row.label}
            </span>
            {row.detail ? (
              <span className="text-[12.5px] leading-[18px] text-text-muted">{row.detail}</span>
            ) : null}
            {row.done ? null : (
              // Every unfinished row leads back to its step; Continue there returns here.
              <TextLink
                className="text-[12.5px] text-text-brand hover:text-text-brand"
                onClick={() => onGoTo(row.step)}
              >
                Set up
              </TextLink>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-[30px] flex items-center gap-3">
        <PrimaryButton
          className="h-[54px] gap-2.5 rounded-xl px-[26px] text-[16px] leading-[23px] font-[650]"
          onClick={onStartMeeting}
          disabled={!model.ready}
        >
          <MicIcon size={18} />
          Start a meeting
          <kbd className="flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-white/18 bg-white/14 px-1.5 font-[family-name:inherit] text-[12px] leading-4 font-medium text-[#dde9f2]">
            ⌘ N
          </kbd>
        </PrimaryButton>
        {!model.ready ? (
          <span className="text-[12.5px] leading-[18px] text-text-muted">
            Available once the speech model is downloaded
          </span>
        ) : null}
      </div>
    </section>
  );
}
