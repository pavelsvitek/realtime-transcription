import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { microphoneStepState } from "../../lib/setup-wizard";
import {
  ArrowRight,
  CheckBadge,
  ErrorText,
  MicIcon,
  MissingBadge,
  PrimaryButton,
  StepLayout,
} from "./ui";
import { useSystemAccess, type WizardSystemAccess } from "./useSystemAccess";

export function MicrophoneStep({ onNext }: { onNext: () => void }) {
  const { status, setStatus, error: statusError } = useSystemAccess(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = microphoneStepState(status?.microphone);

  const ask = async () => {
    setAsking(true);
    setError(null);
    try {
      // Never asked: show the macOS prompt. Refused: only System Settings can change it.
      const next =
        state === "denied"
          ? await invoke<WizardSystemAccess>("open_system_access_settings", { pane: "microphone" })
          : await invoke<WizardSystemAccess>("request_microphone_permission");
      setStatus(next);
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
            <ArrowRight />
          </PrimaryButton>
        ) : (
          <>
            <PrimaryButton className="px-[22px]" onClick={() => void ask()} disabled={asking}>
              <MicIcon />
              {state === "denied" ? "Open System Settings" : "Allow microphone"}
            </PrimaryButton>
            <span className="text-[12.5px] leading-[18px] text-text-muted">
              {state === "denied" ? "Turn on Amie under Microphone" : "Shows the macOS prompt"}
            </span>
          </>
        )}
      </div>

      <p className="mt-5 flex items-center gap-2 text-[13px] leading-[19px] text-text-secondary">
        {state === "allowed" ? <CheckBadge /> : <MissingBadge />}
        {state === "allowed" ? "Allowed" : state === "denied" ? "Not allowed" : "Not allowed yet"}
      </p>
      {error || statusError ? <ErrorText>{error ?? statusError}</ErrorText> : null}
    </StepLayout>
  );
}
