/** Google Meet extension speaker-tracking — the local user's mic button (muted or not). */

/** Not localised on purpose: `micro`/`mikro` cover microphone, mikrofon, micrófono, micro, microfono. */
const MIC_LABEL = /micro|mikro|\bmic\b/i;
const TURN_ON_MIC = /turn on (the )?(microphone|mic)\b/i;
const TURN_OFF_MIC = /turn off (the )?(microphone|mic)\b/i;

/**
 * `true` muted, `false` unmuted, `null` when no mic button is found or it cannot be
 * read. The bridge treats `null` as unmuted, so an unknown Meet change never silences
 * the user.
 *
 * Meet marks the toolbar toggles with `data-is-muted`. The camera button carries the
 * same attribute, so the aria-label picks the mic. Without the attribute, the English
 * "Turn on microphone" / "Turn off microphone" label is the fallback.
 */
export function readMicMuted(root: ParentNode): boolean | null {
  const buttons = root.querySelectorAll("button[aria-label], [role='button'][aria-label]");
  for (const button of Array.from(buttons)) {
    const label = button.getAttribute("aria-label") ?? "";
    if (!MIC_LABEL.test(label)) continue;
    const flag = button.getAttribute("data-is-muted");
    if (flag === "true") return true;
    if (flag === "false") return false;
    if (TURN_ON_MIC.test(label)) return true;
    if (TURN_OFF_MIC.test(label)) return false;
  }
  return null;
}
