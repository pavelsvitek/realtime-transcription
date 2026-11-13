import { useSpeakerTagsStatus } from "../hooks/useSpeakerTagsStatus";
import { accessibilityNotice, hasStableSignature } from "../lib/speaker-tags";
import { Button } from "./ui/Button";

/** Shown only while macOS reports Accessibility as off for this process. */
export function SpeakerNamesPrompt() {
  const { status, requestAccess, requesting, requested, requestError } = useSpeakerTagsStatus();
  const notice = accessibilityNotice(status);
  if (!notice) return null;

  const needsRelaunchHint =
    requested || (status != null && !hasStableSignature(status));

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-input bg-surface-hover px-4 py-2.5 text-[13px] text-text-primary [&_p]:m-0 [&_p]:leading-[1.45]">
      <div>
        <p>{notice.message}</p>
        {notice.signingHint && <p>{notice.signingHint}</p>}
        {needsRelaunchHint && (
          <p>This page updates once this process is trusted. If it stays off after enabling the matching row, quit and reopen Amie.</p>
        )}
        {requestError && <p>{requestError}</p>}
      </div>
      <Button
        variant="outline"
        disabled={requesting}
        onClick={() => requestAccess()}
      >
        Allow Accessibility
      </Button>
    </div>
  );
}
