/** Google Meet extension speaker-tracking — loopback ports for Amie `meet_bridge`. */

export const MEET_BRIDGE_PORTS = [47821, 47822, 47823, 47824, 47825] as const;
export const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000] as const;

export function portOrder(lastGood: number | null): number[] {
  const ports: number[] = [...MEET_BRIDGE_PORTS];
  if (lastGood != null && ports.includes(lastGood)) {
    return [lastGood, ...ports.filter((port) => port !== lastGood)];
  }
  return ports;
}

export function nextPort(lastGood: number | null, attempt: number): number {
  const ports = portOrder(lastGood);
  const index = ((attempt % ports.length) + ports.length) % ports.length;
  return ports[index] ?? MEET_BRIDGE_PORTS[0];
}

export function backoffDelay(failures: number): number {
  const index = Math.min(Math.max(failures, 0), BACKOFF_MS.length - 1);
  return BACKOFF_MS[index];
}
