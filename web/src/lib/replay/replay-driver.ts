import type { ActiveSession } from "@/lib/session/types";
import type { StubUpdatesFile } from "@/lib/session/types";
import {
  buildWordTimeline,
  type TranscriptFixtureSegment,
} from "./word-timeline";

export type ReplayDriverState = {
  playing: boolean;
  speed: number;
  elapsedMs: number;
};

export const SEEK_STEP_MS = 10_000;

export type ReplayDriver = {
  play(): void;
  pause(): void;
  reset(): void;
  seekBy(deltaMs: number): void;
  setSpeed(multiplier: number): void;
  getState(): ReplayDriverState;
  subscribe(listener: () => void): () => void;
  destroy(): void;
};

type ReplayDriverInput = {
  session: ActiveSession;
  segments: TranscriptFixtureSegment[];
  durationMs: number;
  stubTriggers?: StubUpdatesFile["triggers"];
};

export function createReplayDriver(input: ReplayDriverInput): ReplayDriver {
  const { session, segments, durationMs, stubTriggers = [] } = input;
  const wordTicks = buildWordTimeline(segments);
  const triggerBySegment = new Map(
    stubTriggers.map((trigger) => [trigger.afterSegmentId, trigger.updates]),
  );

  let playing = false;
  let speed = 1;
  let elapsedMs = 0;
  let tickIndex = 0;
  let wallAnchorMs = 0;
  let virtualAnchorMs = 0;
  let rafId: number | null = null;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const listener of listeners) {
      listener();
    }
  }

  function getState(): ReplayDriverState {
    return { playing, speed, elapsedMs };
  }

  function fireStubUpdates(segmentId: string): void {
    const updates = triggerBySegment.get(segmentId);
    if (updates) {
      session.applyCardUpdates(updates);
    }
  }

  function drainTicksUpTo(targetMs: number): void {
    while (tickIndex < wordTicks.length && wordTicks[tickIndex].atMs <= targetMs) {
      const tick = wordTicks[tickIndex];
      session.appendTranscript({
        id: tick.segmentId,
        speakerKey: tick.speakerKey,
        text: tick.text,
        startMs: tick.segmentStartMs,
        final: tick.final,
      });

      if (tick.final) {
        fireStubUpdates(tick.segmentId);
      }

      tickIndex += 1;
    }

    elapsedMs = Math.min(targetMs, durationMs);
    session.setElapsed(elapsedMs);
    notify();
  }

  function tick(now: number): void {
    if (!playing) return;

    const virtualMs = Math.min(
      (now - wallAnchorMs) * speed + virtualAnchorMs,
      durationMs,
    );

    drainTicksUpTo(virtualMs);

    if (virtualMs >= durationMs) {
      playing = false;
      notify();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function play(): void {
    if (playing) return;
    if (elapsedMs >= durationMs) return;

    playing = true;
    wallAnchorMs = performance.now();
    virtualAnchorMs = elapsedMs;
    notify();
    rafId = requestAnimationFrame(tick);
  }

  function pause(): void {
    if (!playing) return;

    const now = performance.now();
    elapsedMs = Math.min(
      (now - wallAnchorMs) * speed + virtualAnchorMs,
      durationMs,
    );
    playing = false;

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    session.setElapsed(elapsedMs);
    notify();
  }

  function reset(): void {
    pause();
    elapsedMs = 0;
    tickIndex = 0;
    virtualAnchorMs = 0;
    session.reset();
    notify();
  }

  function seekTo(targetMs: number): void {
    const wasPlaying = playing;
    pause();

    const clampedTarget = Math.max(0, Math.min(targetMs, durationMs));
    if (clampedTarget === elapsedMs) {
      if (wasPlaying && elapsedMs < durationMs) play();
      return;
    }

    if (clampedTarget < elapsedMs) {
      const snapshots = session.captureDispositionSnapshots();
      session.reset();
      tickIndex = 0;
      elapsedMs = 0;
      virtualAnchorMs = 0;
      drainTicksUpTo(clampedTarget);
      session.reapplyDispositionSnapshots(snapshots, clampedTarget);
    } else {
      drainTicksUpTo(clampedTarget);
    }

    virtualAnchorMs = elapsedMs;
    notify();

    if (wasPlaying && elapsedMs < durationMs) {
      play();
    }
  }

  function seekBy(deltaMs: number): void {
    seekTo(elapsedMs + deltaMs);
  }

  function setSpeed(multiplier: number): void {
    if (multiplier <= 0) return;

    if (playing) {
      const now = performance.now();
      elapsedMs = Math.min(
        (now - wallAnchorMs) * speed + virtualAnchorMs,
        durationMs,
      );
      wallAnchorMs = now;
      virtualAnchorMs = elapsedMs;
    }

    speed = multiplier;
    notify();

    if (playing) {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    }
  }

  function destroy(): void {
    pause();
    listeners.clear();
  }

  return {
    play,
    pause,
    reset,
    seekBy,
    setSpeed,
    getState,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy,
  };
}
