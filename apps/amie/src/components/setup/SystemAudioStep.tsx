import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SystemAudioTestResult } from "../../lib/setup-wizard";
import { Spinner } from "../Spinner";
import {
  ArrowRight,
  CheckBadge,
  ErrorText,
  Icon,
  MissingBadge,
  OutlineButton,
  PrimaryButton,
  StepLayout,
  TextLink,
} from "./ui";
import { useSystemAccess, type WizardSystemAccess } from "./useSystemAccess";

type SystemAudioTest = { heard: boolean; peak: number; device: string };

type SystemAudioStepProps = {
  result: SystemAudioTestResult;
  onResult: (result: SystemAudioTestResult) => void;
  onNext: () => void;
};

/**
 * System Audio Recording. macOS reports the grant through the TCC preflight
 * (`systemAudio` in get_system_access_status): allowed shows Continue, never
 * asked shows the macOS prompt, refused opens System Settings. When that check
 * is unavailable ("unknown"), the test sound (`test_system_audio`) is the only
 * proof. The test stays available as an optional check in every case.
 */
export function SystemAudioStep({ result, onResult, onNext }: SystemAudioStepProps) {
  const { status, setStatus, error: statusError } = useSystemAccess(true);
  const [testing, setTesting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const access = status?.systemAudio ?? "unknown";
  const allowed = access === "authorized";

  const openSettings = async () => {
    setError(null);
    try {
      await invoke("open_system_access_settings", { pane: "systemAudio" });
    } catch (e) {
      setError(String(e));
    }
  };

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      setStatus(await invoke<WizardSystemAccess>("request_system_audio_permission"));
    } catch (e) {
      setError(String(e));
    } finally {
      setAsking(false);
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
      copy={
        allowed
          ? "Zoom, Meet, Chrome: any audio playing on this Mac. macOS already lets Amie record it."
          : access === "notDetermined"
            ? "Zoom, Meet, Chrome: any audio playing on this Mac. macOS will ask for permission."
            : "Zoom, Meet, Chrome: any audio playing on this Mac. Turn it on in System Settings, then test it."
      }
    >
      {access === "denied" || access === "unknown" ? (
        <>
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
        </>
      ) : null}

      {access !== "unknown" ? (
        <p className="mt-5 flex items-center gap-2 text-[13px] leading-[19px] text-text-secondary">
          {allowed ? <CheckBadge /> : <MissingBadge />}
          {allowed ? "Allowed" : access === "denied" ? "Not allowed" : "Not allowed yet"}
        </p>
      ) : null}

      {testing || result ? <TestResult testing={testing} result={result} /> : null}

      {error || statusError ? <ErrorText>{error ?? statusError}</ErrorText> : null}

      <div className="mt-[22px] flex items-center gap-[18px]">
        {allowed || (result === "heard" && !testing) ? (
          <>
            <PrimaryButton onClick={onNext}>
              Continue
              <ArrowRight />
            </PrimaryButton>
            <TextLink onClick={() => void test()} disabled={testing}>
              {result ? "Play the test sound again" : "Play a test sound"}
            </TextLink>
          </>
        ) : access === "notDetermined" ? (
          <>
            <PrimaryButton className="px-[22px]" onClick={() => void ask()} disabled={asking}>
              <SpeakerIcon size={16} />
              Allow system audio
            </PrimaryButton>
            <span className="text-[12.5px] leading-[18px] text-text-muted">Shows the macOS prompt</span>
          </>
        ) : (
          <PrimaryButton className="px-[22px]" onClick={() => void test()} disabled={testing}>
            <SpeakerIcon size={16} />
            {testing ? "Listening…" : result === "silent" ? "Try again" : "Play a test sound"}
          </PrimaryButton>
        )}
      </div>

      {!allowed ? (
        <p className="mt-4 flex items-center gap-1.5 text-[12.5px] leading-[18px] text-text-muted">
          Can't test right now?
          <TextLink className="text-[12.5px]" onClick={onNext} disabled={testing}>
            I've done this, continue
          </TextLink>
        </p>
      ) : null}
    </StepLayout>
  );
}

function TestResult({ testing, result }: { testing: boolean; result: SystemAudioTestResult }) {
  return (
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
