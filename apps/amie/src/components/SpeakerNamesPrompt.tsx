import { useSpeakerTagsStatus } from "../hooks/useSpeakerTagsStatus";
import { accessibilityNotice, hasStableSignature } from "../lib/speaker-tags";

/** Shown only while macOS reports Accessibility as off for this process. */
export function SpeakerNamesPrompt() {
  const { status, requestAccess, requesting, requested, requestError } = useSpeakerTagsStatus();
  const notice = accessibilityNotice(status);
  if (!notice) return null;

  const needsRelaunchHint =
    requested || (status != null && !hasStableSignature(status));

  return (
    <div className="speaker-prompt">
      <div>
        <p>{notice.message}</p>
        {notice.signingHint && <p>{notice.signingHint}</p>}
        {needsRelaunchHint && (
          <p>This page updates once this process is trusted. If it stays off after enabling the matching row, quit and reopen Amie.</p>
        )}
        {requestError && <p>{requestError}</p>}
      </div>
      <button
        className="btn btn-clear"
        type="button"
        disabled={requesting}
        onClick={() => requestAccess()}
      >
        Allow Accessibility
      </button>
    </div>
  );
}
