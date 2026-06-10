export const REPLAY_SPEED_OPTIONS = [1, 2, 4, 8] as const;

export type ReplaySpeed = (typeof REPLAY_SPEED_OPTIONS)[number];

export function stepReplaySpeedUp(current: number): ReplaySpeed | null {
  const index = REPLAY_SPEED_OPTIONS.indexOf(current as ReplaySpeed);
  if (index === -1) return REPLAY_SPEED_OPTIONS[0];
  if (index >= REPLAY_SPEED_OPTIONS.length - 1) return null;
  return REPLAY_SPEED_OPTIONS[index + 1];
}

export function stepReplaySpeedDown(current: number): ReplaySpeed | null {
  const index = REPLAY_SPEED_OPTIONS.indexOf(current as ReplaySpeed);
  if (index === -1) return REPLAY_SPEED_OPTIONS[0];
  if (index <= 0) return null;
  return REPLAY_SPEED_OPTIONS[index - 1];
}
