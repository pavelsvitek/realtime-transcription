export type CaptureNotice = {
  id: string;
  message: string;
};

export type SilenceSource = "mic" | "system";

/** Which silence banner a status message belongs to, if it is one. */
export function silenceSourceOf(message: string): SilenceSource | null {
  const text = message.trim();
  if (/^microphone is silent\b/i.test(text)) return "mic";
  if (/^system audio capture is silent\b/i.test(text)) return "system";
  return null;
}

/** Keep each distinct capture warning. A later status must not replace an earlier one. */
export function addCaptureNotice(
  notices: CaptureNotice[],
  dismissed: ReadonlySet<string>,
  heard: ReadonlySet<SilenceSource>,
  message: string | null | undefined,
): CaptureNotice[] {
  const text = message?.trim();
  if (!text || dismissed.has(text)) {
    return notices;
  }
  const source = silenceSourceOf(text);
  if (source && heard.has(source)) {
    return notices;
  }
  if (notices.some((notice) => notice.message === text)) {
    return notices;
  }
  return [...notices, { id: text, message: text }];
}

/**
 * Hide the silence banner for one source as soon as that source has sound.
 * Other banners stay. The warning stays dismissed for the rest of the session.
 */
export function clearSilenceOnSound(
  notices: CaptureNotice[],
  dismissed: Set<string>,
  heard: Set<SilenceSource>,
  source: SilenceSource,
): CaptureNotice[] {
  heard.add(source);
  let changed = false;
  const next = notices.filter((notice) => {
    if (silenceSourceOf(notice.message) !== source) {
      return true;
    }
    dismissed.add(notice.id);
    changed = true;
    return false;
  });
  return changed ? next : notices;
}
