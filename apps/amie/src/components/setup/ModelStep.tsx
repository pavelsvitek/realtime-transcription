import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSpeechModelDownload } from "../../hooks/useSpeechModelDownload";
import { EXPECTED_MODEL_SIZE_BYTES, type SpeechModelStatus } from "../../lib/onboarding";
import { downloadedMegabytes, totalMegabytes } from "../../lib/setup-wizard";
import { ArrowRight, Check, ErrorText, PrimaryButton, ProgressTrack, StepLayout } from "./ui";

export function ModelStep({ onNext }: { onNext: () => void }) {
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
            <span className="text-[13px] leading-[19px] font-[650] text-text-brand">{percent}%</span>
          ) : null}
        </div>
        {started ? (
          <>
            <ProgressTrack percent={percent} className="h-1.5 rounded-sm" />
            <p className="flex items-center gap-2 text-[13px] leading-[19px] text-text-secondary">
              <Check />
              {model.ready
                ? "The speech model is on this Mac."
                : "Download started. It keeps going if you move on or close this window."}
            </p>
          </>
        ) : null}
      </div>

      {helperMissing ? (
        <p className="mt-3 text-[13px] leading-[19px] text-text-secondary">
          The speech helper is missing. Run <code>./scripts/setup-nemotron.sh</code> once, then
          try again.
        </p>
      ) : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <div className="mt-6 flex items-center gap-3.5">
        {started ? (
          <PrimaryButton onClick={onNext}>
            Continue
            <ArrowRight />
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
