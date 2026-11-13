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
      className="onboarding-dialog"
    >
      <div className="onboarding-dialog-chrome">
        <p className="onboarding-step-label">Step {step} of 2</p>
        <button
          type="button"
          className="onboarding-close"
          aria-label="Close onboarding"
          onClick={onDismiss}
        >
          Close
        </button>
      </div>

      {step === 1 ? (
        <>
          <div className="onboarding-dialog-body">
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
              <p className="onboarding-error" role="alert">
                {downloadError}
              </p>
            ) : null}
            {modelStatus?.helperFound === false ? (
              <p className="onboarding-hint">
                The speech helper is missing. Run{" "}
                <code>./scripts/setup-nemotron.sh</code> once, then try again.
              </p>
            ) : null}
          </div>
          <div className="onboarding-dialog-footer">
            <div className="onboarding-dialog-actions">
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
          <div className="onboarding-dialog-body">
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

            <div className="onboarding-access-list">
              <div className="onboarding-access-row">
                <div>
                  <h3 className="onboarding-access-heading">Microphone</h3>
                  <p className="onboarding-access-copy">
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

              <div className="onboarding-access-row">
                <div>
                  <h3 className="onboarding-access-heading">System audio</h3>
                  <p className="onboarding-access-copy">
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

              <div className="onboarding-access-row">
                <div>
                  <h3 className="onboarding-access-heading">Accessibility</h3>
                  <p className="onboarding-access-copy">
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
              <p className="onboarding-error" role="alert">
                {accessError}
              </p>
            ) : null}
          </div>
          <div className="onboarding-dialog-footer">
            <div className="onboarding-dialog-actions">
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
