/** Google Meet extension speaker-tracking — find a replacement level meter if `QgSmzd` disappears. */

export type ClassFlip = { tokens: string; at: number };

export function isDiscoveryCandidate(events: ClassFlip[], now: number, small: boolean): boolean {
  if (!small) return false;
  const recent = events.filter((event) => now - event.at <= 2_000);
  if (recent.length < 5) return false;
  const distinct = new Set(recent.map((event) => event.tokens));
  return distinct.size >= 2 && distinct.size <= 8;
}
