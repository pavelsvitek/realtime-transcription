/** Google Meet extension speaker-tracking — which Google Meet participant is the local user. */

export function coincidingFraction(anchor: number[], other: number[], toleranceMs: number): number {
  if (anchor.length === 0) return 0;
  let hits = 0;
  for (const time of anchor) {
    if (other.some((candidate) => Math.abs(candidate - time) <= toleranceMs)) hits += 1;
  }
  return hits / anchor.length;
}

/** Toolbar mic meter lockstep (>90% of toolbar changes). Needs a few changes so a blip cannot win. */
export function selfIdFromCorrelation(
  toolbarChanges: number[],
  participantChanges: Map<string, number[]>,
): string | null {
  if (toolbarChanges.length < 4) return null;
  let best: { id: string; fraction: number } | null = null;
  for (const [id, times] of participantChanges) {
    const fraction = coincidingFraction(toolbarChanges, times, 50);
    if (fraction > 0.9 && (best == null || fraction > best.fraction)) {
      best = { id, fraction };
    }
  }
  return best?.id ?? null;
}

export function looksLikeYou(label: string): boolean {
  return /\(You\)\s*$/i.test(label.trim());
}

export function stripYou(name: string): string {
  return name.replace(/\s*\(You\)\s*$/i, "").trim();
}
