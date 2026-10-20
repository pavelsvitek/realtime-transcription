/** Google Meet extension speaker-tracking — in-call detection and meeting code. */

import type { Selectors } from "./selectors";

const MEETING_CODE = /^\/([a-z0-9]{3,}-[a-z0-9]{3,}-[a-z0-9]{3,})\/?$/i;

export function meetingCodeFromPath(pathname: string): string | null {
  const match = pathname.match(MEETING_CODE);
  return match ? match[1].toLowerCase() : null;
}

export function detectCall(
  pathname: string,
  root: ParentNode,
  selectors: Selectors,
): { inCall: boolean; code: string | null } {
  const code = meetingCodeFromPath(pathname);
  const tiles = root.querySelectorAll(selectors.participant).length;
  return { inCall: code != null && tiles > 0, code };
}
