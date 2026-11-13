import { useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowRight, CheckBadge, ErrorText, Icon, PrimaryButton, StepLayout, TextLink } from "./ui";
import { useSystemAccess, type WizardSystemAccess } from "./useSystemAccess";

export function SpeakersStep({ onNext }: { onNext: () => void }) {
  const { status, setStatus, error: statusError } = useSystemAccess(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const axAllowed = status?.accessibility.trusted === true;
  const meetConnected = status?.googleMeetExtension.connected === true;

  const allowAccessibility = async () => {
    setOpening(true);
    setError(null);
    try {
      setStatus(
        await invoke<WizardSystemAccess>("open_system_access_settings", { pane: "accessibility" }),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <StepLayout
      step="speakers"
      title="Know who said what."
      copy="Amie can label speakers by name in calls. Both are optional and you can add them later in Settings."
    >
      <div className="mt-[22px] flex w-full flex-col border-t border-border-default">
        <SpeakerRow
          icon={
            <>
              <circle cx="12" cy="5" r="2" />
              <path d="M4 9h16" />
              <path d="M12 9v5" />
              <path d="m8 21 4-7 4 7" />
            </>
          }
          title="Accessibility"
          copy="Reads who Zoom or Teams shows as speaking. Does not record the screen."
          action={
            axAllowed ? (
              <Allowed label="Allowed" />
            ) : (
              <SoftButton onClick={() => void allowAccessibility()} disabled={opening}>
                {opening ? "Opening…" : "Allow Accessibility"}
              </SoftButton>
            )
          }
        />
        <SpeakerRow
          icon={
            <path d="M19.4 14.5V19a1 1 0 0 1-1 1h-4.2a2.2 2.2 0 1 0-4.4 0H5.6a1 1 0 0 1-1-1v-4.2a2.2 2.2 0 1 1 0-4.4V6a1 1 0 0 1 1-1h4.2a2.2 2.2 0 1 1 4.4 0h4.2a1 1 0 0 1 1 1v4.2a2.2 2.2 0 1 0 0 4.3Z" />
          }
          title="Google Meet extension"
          copy="Names remote speakers in Google Meet."
          action={
            meetConnected ? (
              <Allowed label="Connected" />
            ) : (
              // No store listing yet, so there is nothing to link to.
              <span className="text-right text-[12px] leading-[17px] text-text-muted">
                Not connected
              </span>
            )
          }
        />
      </div>

      {error || statusError ? <ErrorText>{error ?? statusError}</ErrorText> : null}

      <div className="mt-[26px] flex items-center gap-[18px]">
        <PrimaryButton onClick={onNext}>
          Continue
          <ArrowRight />
        </PrimaryButton>
        <TextLink onClick={onNext}>Skip</TextLink>
      </div>
    </StepLayout>
  );
}

function SpeakerRow({
  icon,
  title,
  copy,
  action,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
  action: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-3.5 border-b border-border-default py-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-surface-muted text-text-secondary">
        <Icon size={18}>{icon}</Icon>
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[14px] leading-5 font-semibold text-text-primary">{title}</span>
        <span className="text-[13px] leading-[19px] text-text-secondary">{copy}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end">{action}</div>
    </div>
  );
}

function Allowed({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] leading-[19px] font-semibold text-text-brand">
      <CheckBadge />
      {label}
    </span>
  );
}

function SoftButton(props: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-[30px] shrink-0 cursor-pointer items-center justify-center rounded-md border border-brand-accent-soft bg-brand-accent-soft px-3 text-[12.5px] leading-4 font-[550] text-brand-accent-ink enabled:hover:bg-brand-accent-soft-hover disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}
