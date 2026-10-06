import { useSpeakerTagsStatus } from "../hooks/useSpeakerTagsStatus";
import { accessibilityNotice } from "../lib/speaker-tags";

/** Shown only while macOS reports Accessibility as off for this build. */
export function SpeakerNamesPrompt() {
  const { status, requestAccess, requesting, requested, requestError } = useSpeakerTagsStatus();
  const notice = accessibilityNotice(status);
  if (!notice) return null;

  return (
    <div className="speaker-prompt">
      <div>
        <p>{notice.message}</p>
        {notice.signingHint && <p>{notice.signingHint}</p>}
        {requested && (
          <p>This page updates once it is on. If it stays off, quit and reopen Amie.</p>
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
