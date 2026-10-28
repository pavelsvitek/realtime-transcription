/** Google Meet extension speaker-tracking — pure meter events → speaking participant ids. */

export const IDLE_LEARN_MS = 1500;
export const CHANGE_WINDOW_MS = 300;
export const MIN_ON_CHANGES = 2;
export const HANGOVER_MS = 500;
/** A rest off idle counts as speech only this long. Longer than that is a new baseline, not a pinned speaker. */
export const HELD_MAX_MS = 1_000;

export type MeterEvent = {
  participantId: string;
  meterId: string;
  at: number;
  tokens: string;
};

type MeterState = {
  participantId: string;
  lastChangeAt: number;
  tokens: string;
  idleTokens: string | null;
  changeTimes: number[];
  activeUntil: number;
  primed: boolean;
};

export type Detector = {
  onMeter: (event: MeterEvent) => void;
  speaking: (now: number) => Set<string>;
};

export function createDetector(): Detector {
  const meters = new Map<string, MeterState>();

  return {
    onMeter(event) {
      const key = `${event.participantId}\0${event.meterId}`;
      let state = meters.get(key);
      if (!state) {
        state = {
          participantId: event.participantId,
          lastChangeAt: event.at,
          tokens: event.tokens,
          idleTokens: null,
          changeTimes: [],
          activeUntil: 0,
          primed: false,
        };
        meters.set(key, state);
      }
      if (!state.primed) {
        state.primed = true;
        state.tokens = event.tokens;
        state.lastChangeAt = event.at;
        return;
      }
      if (state.tokens === event.tokens) return;
      state.tokens = event.tokens;
      state.lastChangeAt = event.at;
      state.changeTimes.push(event.at);
    },
    speaking(now) {
      const speaking = new Set<string>();
      for (const state of meters.values()) {
        if (now - state.lastChangeAt >= IDLE_LEARN_MS) {
          state.idleTokens = state.tokens;
        }
        state.changeTimes = state.changeTimes.filter((at) => now - at <= CHANGE_WINDOW_MS);
        // Speech needs a learned idle and a real excursion off it. Flicker before
        // idle is known is not speech. `held` is capped so a class that rests off
        // idle cannot pin the participant for the rest of the call.
        const offIdle = state.idleTokens != null && state.tokens !== state.idleTokens;
        const sinceChange = now - state.lastChangeAt;
        const flickering =
          state.changeTimes.length >= MIN_ON_CHANGES && sinceChange <= CHANGE_WINDOW_MS && offIdle;
        const held = offIdle && sinceChange > CHANGE_WINDOW_MS && sinceChange <= HELD_MAX_MS;
        if (flickering || held) {
          state.activeUntil = now + HANGOVER_MS;
          speaking.add(state.participantId);
        } else if (state.activeUntil > 0 && now <= state.activeUntil) {
          speaking.add(state.participantId);
        }
      }
      return speaking;
    },
  };
}
