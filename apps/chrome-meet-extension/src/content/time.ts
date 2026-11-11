/** Google Meet extension speaker-tracking — wall clock shared with Amie `meet_bridge`. */

export function observedAt(now: number = performance.now()): number {
  return performance.timeOrigin + now;
}
