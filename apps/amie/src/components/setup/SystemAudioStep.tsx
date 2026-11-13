import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemAudioTestResult } from "../../lib/setup-wizard";
import { Spinner } from "../Spinner";
import {
  ArrowRight,
  CheckBadge,
  ErrorText,
  Icon,
  OutlineButton,
  PrimaryButton,
  StepLayout,
  TextLink,
} from "./ui";

type SystemAudioTest = { heard: boolean; peak: number; device: string };

type SystemAudioStepProps = {
  result: SystemAudioTestResult;
  onResult: (result: SystemAudioTestResult) => void;
  onNext: () => void;
};

/**
 * macOS cannot report the System Audio Recording grant, so this step plays a
 * short sound and listens for it on the loopback tap (`test_system_audio`).
 */
export function SystemAudioStep({ result, onResult, onNext }: SystemAudioStepProps) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSettings = async () => {
    setError(null);
    try {
      await invoke("open_system_access_settings", { pane: "systemAudio" });
    } catch (e) {
      setError(String(e));
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      const outcome = await invoke<SystemAudioTest>("test_system_audio");
      onResult(outcome.heard ? "heard" : "silent");
    } catch (e) {
      setError(String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <StepLayout
      step="systemAudio"
      title="So Amie can hear the other people on the call."
      copy="Zoom, Meet, Chrome: any audio playing on this Mac. macOS can't tell Amie whether this is on, so you can test it."
    >
      <ol className="mt-[22px] flex flex-col gap-2.5">
        <Hint number={1}>
          Open System Audio settings and turn on Amie under System Audio Recording.
        </Hint>
        <Hint number={2}>macOS may ask to quit and reopen Amie. That is expected.</Hint>
      </ol>

      <OutlineButton className="mt-5" onClick={() => void openSettings()}>
        <SpeakerIcon size={15} />
        Open System Audio settings
      </OutlineButton>

      {testing || result ? (
        <div className="mt-[22px] flex w-full items-center gap-3 rounded-xl border border-border-default bg-surface-content px-[18px] py-3.5">
          {testing ? (
            <span className="flex size-[22px] shrink-0 items-center justify-center text-text-brand">
              <Spinner className="size-[18px]" />
            </span>
          ) : result === "heard" ? (
            <CheckBadge size={22} />
          ) : (
            <span
              className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-status-danger bg-status-danger-bg"
              aria-hidden="true"
            >
              <span className="size-[6px] rounded-full bg-status-danger" />
            </span>
          )}
          <div className="flex flex-col" role="status">
            <span className="text-[14px] leading-5 font-[650] text-text-primary">
              {testing ? "Listening…" : result === "heard" ? "Heard it" : "Didn't hear it"}
            </span>
            <span className="text-[13px] leading-[19px] text-text-secondary">
              {testing
                ? "Playing a short sound through your speakers."
                : result === "heard"
                  ? "Amie picked up the test sound from system audio."
                  : "Turn on Amie under System Audio Recording, reopen Amie, and check the sound isn't muted."}
            </span>
          </div>
        </div>
      ) : null}

      {error ? <ErrorText>{error}</ErrorText> : null}

      <div className="mt-[22px] flex items-center gap-[18px]">
        {result === "heard" && !testing ? (
          <>
            <PrimaryButton onClick={onNext}>
              Continue
              <ArrowRight />
            </PrimaryButton>
            <TextLink onClick={() => void test()}>Play the test sound again</TextLink>
          </>
        ) : (
          <PrimaryButton className="px-[22px]" onClick={() => void test()} disabled={testing}>
            <SpeakerIcon size={16} />
            {testing ? "Listening…" : result === "silent" ? "Try again" : "Play a test sound"}
          </PrimaryButton>
        )}
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] leading-[18px] text-text-muted">
        Can't test right now?
        <TextLink className="text-[12.5px]" onClick={onNext} disabled={testing}>
          I've done this, continue
        </TextLink>
      </p>
    </StepLayout>
  );
}

function Hint({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-lg bg-brand-accent-soft text-[11.5px] leading-[14px] font-bold text-brand-accent-ink">
        {number}
      </span>
      <span className="text-[13.5px] leading-5 text-text-primary">{children}</span>
    </li>
  );
}

function SpeakerIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </Icon>
  );
}
