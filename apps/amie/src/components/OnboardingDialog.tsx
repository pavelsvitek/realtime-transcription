import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { invoke } from "@tauri-apps/api/core";
import { useHoldMeetingConfirmOpen } from "./StartMeetingConfirm";
import { formatModelSize, type SpeechModelStatus } from "../lib/onboarding";
import { Button } from "./ui/Button";
import { Dialog, DialogDescription, DialogTitle } from "./ui/Dialog";

type OnboardingStep = 1 | 2;

type MicrophoneAuthorization =
  | "notDetermined"
  | "restricted"
  | "denied"
  | "authorized"
  | "unknown";

type SystemAccessStatus = {
  microphone: MicrophoneAuthorization;
  systemAudio: "reviewInSettings";
  accessibility: {
    trusted: boolean;
    buildLabel: string;
  };
};

type OnboardingDialogProps = {
  modelStatus: SpeechModelStatus | null;
  onDismiss: () => void;
  onComplete: () => void;
  onStartDownload: () => Promise<void>;
};

export function OnboardingDialog({
  modelStatus,
  onDismiss,
  onComplete,
  onStartDownload,
}: OnboardingDialogProps) {
  const [step, setStep] = useState<OnboardingStep>(1);
  const [startingDownload, setStartingDownload] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [systemAccess, setSystemAccess] = useState<SystemAccessStatus | null>(null);
  const [openingPane, setOpeningPane] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  useHoldMeetingConfirmOpen(true);

  const sizeLabel = formatModelSize(modelStatus?.expectedSizeBytes);
  const modelReady = modelStatus?.ready === true;

  const refreshSystemAccess = useCallback(async () => {
    try {
      const next = await invoke<SystemAccessStatus>("get_system_access_status");
      setSystemAccess(next);
      setAccessError(null);
    } catch (error) {
      setAccessError(String(error));
    }
  }, []);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step !== 2) return;
    void refreshSystemAccess();
    const onFocus = () => void refreshSystemAccess();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [step, refreshSystemAccess]);

  useHotkey(
    "Escape",
    (event) => {
      if (event.isComposing) return;
      onDismiss();
    },
    {
      conflictBehavior: "allow",
      meta: { name: "Dismiss onboarding" },
    },
  );

  const openAccessPane = async (
    pane: "microphone" | "systemAudio" | "accessibility",
  ) => {
    setOpeningPane(pane);
    setAccessError(null);
    try {
      const next = await invoke<SystemAccessStatus>("open_system_access_settings", {
        pane,
      });
      setSystemAccess(next);
    } catch (error) {
      setAccessError(String(error));
    } finally {
      setOpeningPane(null);
    }
  };

  const handleDownload = async () => {
    setStartingDownload(true);
    setDownloadError(null);
    try {
      await onStartDownload();
      setStep(2);
    } catch (error) {
      setDownloadError(String(error));
    } finally {
      setStartingDownload(false);
    }
  };

  return (
    <Dialog
      onDismiss={onDismiss}
      role="dialog"
      titleId="onboarding-dialog-title"
      descriptionId="onboarding-dialog-copy"
      className="min-h-[min(490px,calc(100vh-64px))] w-[min(720px,calc(100vw-48px))] max-w-[720px] gap-5 p-7"
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="m-0 text-[12px] text-text-secondary">Step {step} of 2</p>
        <button
          type="button"
          className="m-0 cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          aria-label="Close onboarding"
          onClick={onDismiss}
        >
          Close
        </button>
      </div>

      {step === 1 ? (
        <>
          <div className="flex min-h-0 flex-[1_1_auto] flex-col gap-4">
            <DialogTitle id="onboarding-dialog-title" className="text-[22px]">
              Download the speech model
            </DialogTitle>
            <DialogDescription
              id="onboarding-dialog-copy"
              className="text-[15px] leading-normal"
            >
              {modelReady
                ? `The speech model is already on this Mac (${sizeLabel}). Continue when you are ready — you stay in control of what Amie installs.`
                : `Amie needs a local speech model for on-device transcription. The download is ${sizeLabel}. You choose when it starts; nothing downloads until you click Download.`}
            </DialogDescription>
            {downloadError ? (
              <p className="m-0 text-[13px] text-status-danger-text" role="alert">
                {downloadError}
              </p>
            ) : null}
            {modelStatus?.helperFound === false ? (
              <p className="m-0 text-[12px] leading-[1.4] text-text-secondary [&_code]:text-[11px]">
                The speech helper is missing. Run{" "}
                <code>./scripts/setup-nemotron.sh</code> once, then try again.
              </p>
            ) : null}
          </div>
          <div className="mt-auto flex w-full shrink-0 items-start justify-end">
            <div className="ml-auto inline-grid auto-cols-fr grid-flow-col gap-2.5">
              <Button
                variant="secondary"
                size="lg"
                className="min-w-[7.5rem] px-4 whitespace-nowrap"
                onClick={onDismiss}
                disabled={startingDownload}
              >
                Not now
              </Button>
              <Button
                size="lg"
                className="min-w-[7.5rem] px-4 whitespace-nowrap"
                ref={primaryRef}
                onClick={() => void handleDownload()}
                disabled={startingDownload || modelStatus?.helperFound === false}
              >
                {startingDownload
                  ? "Starting…"
                  : modelReady
                    ? "Continue"
                    : "Download"}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-[1_1_auto] flex-col gap-4">
            <DialogTitle id="onboarding-dialog-title" className="text-[22px]">
              Allow Amie to listen and identify speakers
            </DialogTitle>
            <DialogDescription
              id="onboarding-dialog-copy"
              className="text-[15px] leading-normal"
            >
              These macOS permissions are yours to grant. Open each one when you
              are ready — Amie only uses them for live meetings.
            </DialogDescription>

            <div className="flex flex-col">
              <div className="flex flex-col items-start gap-2.5 border-t border-border-default py-3 first:border-t-0 first:pt-0">
                <div>
                  <h3 className="m-0 text-[14px] font-semibold text-text-primary">Microphone</h3>
                  <p className="mt-1 text-[13px] leading-[1.4] text-text-secondary">
                    Needed when you capture your own voice.
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="lg"
                  className="w-[16rem] min-w-[16rem] self-start px-4 whitespace-nowrap"
                  disabled={
                    openingPane !== null ||
                    systemAccess?.microphone === "authorized"
                  }
                  onClick={() => void openAccessPane("microphone")}
                >
                  {openingPane === "microphone"
                    ? "Opening…"
                    : systemAccess?.microphone === "authorized"
                      ? "Allowed"
                      : "Enable Microphone"}
                </Button>
              </div>

              <div className="flex flex-col items-start gap-2.5 border-t border-border-default py-3 first:border-t-0 first:pt-0">
                <div>
                  <h3 className="m-0 text-[14px] font-semibold text-text-primary">System audio</h3>
                  <p className="mt-1 text-[13px] leading-[1.4] text-text-secondary">
                    Captures Chrome or meeting audio playing on this Mac.
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="lg"
                  className="w-[16rem] min-w-[16rem] self-start px-4 whitespace-nowrap"
                  disabled={openingPane !== null}
                  onClick={() => void openAccessPane("systemAudio")}
                >
                  {openingPane === "systemAudio"
                    ? "Opening…"
                    : "Open System Audio settings"}
                </Button>
              </div>

              <div className="flex flex-col items-start gap-2.5 border-t border-border-default py-3 first:border-t-0 first:pt-0">
                <div>
                  <h3 className="m-0 text-[14px] font-semibold text-text-primary">Accessibility</h3>
                  <p className="mt-1 text-[13px] leading-[1.4] text-text-secondary">
                    Read the speaker names from live Zoom or MS Team calls.
                    Makes the meetings transcription and summary much more
                    useful.
                  </p>
                </div>
                <Button
                  variant="accent"
                  size="lg"
                  className="w-[16rem] min-w-[16rem] self-start px-4 whitespace-nowrap"
                  disabled={
                    openingPane !== null ||
                    systemAccess?.accessibility.trusted === true
                  }
                  onClick={() => void openAccessPane("accessibility")}
                >
                  {openingPane === "accessibility"
                    ? "Opening…"
                    : systemAccess?.accessibility.trusted
                      ? "Allowed"
                      : "Allow Accessibility"}
                </Button>
              </div>
            </div>

            {accessError ? (
              <p className="m-0 text-[13px] text-status-danger-text" role="alert">
                {accessError}
              </p>
            ) : null}
          </div>
          <div className="mt-auto flex w-full shrink-0 items-start justify-end">
            <div className="ml-auto inline-grid auto-cols-fr grid-flow-col gap-2.5">
              <Button
                size="lg"
                className="min-w-[7.5rem] px-4 whitespace-nowrap"
                ref={primaryRef}
                onClick={onComplete}
              >
                Done
              </Button>
            </div>
          </div>
        </>
      )}
    </Dialog>
  );
}
