"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createActiveSession } from "@/lib/session/active-session";
import type {
  ActiveSession,
  GenerationMode,
  SessionView,
} from "@/lib/session/types";
import { createReplayDriver, type ReplayDriver } from "@/lib/replay/replay-driver";
import {
  listTranscripts,
  loadFixture,
  type TranscriptListItem,
} from "@/lib/replay/load-fixture";
import { useReplayHotkeys } from "@/hooks/use-replay-hotkeys";
import { ReplayControls } from "./replay-controls";
import { SessionHeader } from "./session-header";
import { SuggestionCard } from "./suggestion-card";
import { TranscriptPanel } from "./transcript-panel";

const DEFAULT_TRANSCRIPT_ID = "customer-interview-meeting-copilot";

const EMPTY_VIEW: SessionView = {
  status: "live",
  mode: "customer_interview",
  modeLabel: "Customer interview",
  title: "",
  elapsedMs: 0,
  elapsedLabel: "00:00",
  transcript: [],
  cards: [],
};

export function SessionPage() {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [driver, setDriver] = useState<ReplayDriver | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptListItem[]>([]);
  const [selectedTranscriptId, setSelectedTranscriptId] = useState(
    DEFAULT_TRANSCRIPT_ID,
  );
  const [generationMode, setGenerationMode] = useState<GenerationMode>("stub");
  const [driverState, setDriverState] = useState({
    playing: false,
    speed: 1,
    elapsedMs: 0,
    generating: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const subscribeToSession = useCallback(
    (onStoreChange: () => void) => {
      if (!session) return () => {};
      return session.subscribe(onStoreChange);
    },
    [session],
  );

  const getSessionView = useCallback(
    () => session?.getView() ?? EMPTY_VIEW,
    [session],
  );

  const view = useSyncExternalStore(
    subscribeToSession,
    getSessionView,
    getSessionView,
  );

  useEffect(() => {
    if (!driver) return;
    setDriverState(driver.getState());
    return driver.subscribe(() => {
      setDriverState(driver.getState());
    });
  }, [driver]);

  useReplayHotkeys({
    driver,
    enabled: !loading && !error,
  });

  const setupFixture = useCallback(async (
    transcriptId: string,
    mode: GenerationMode,
  ) => {
    setLoading(true);
    setError(null);

    setDriver((current) => {
      current?.destroy();
      return null;
    });

    try {
      const { fixture, stubUpdates } = await loadFixture(transcriptId);
      const nextSession = createActiveSession({
        mode: "customer_interview",
        title: fixture.meta.title,
        speakers: fixture.speakers,
        sessionContext: {
          additionalContext: fixture.meta.product_context,
          goal: "Evaluate meeting copilot for UX research interviews",
          participantSegment: "Head of UX Research at B2B SaaS",
          hypothesis:
            "Stable card grid with low-noise follow-ups beats chat-style AI",
        },
      });

      const nextDriver = createReplayDriver({
        session: nextSession,
        segments: fixture.segments,
        durationMs: fixture.meta.duration_ms,
        stubTriggers: stubUpdates.triggers,
        generationMode: mode,
      });

      setSession(nextSession);
      setDriver(nextDriver);
      setSelectedTranscriptId(transcriptId);
      setGenerationMode(mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load transcript");
      setSession(null);
      setDriver(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listTranscripts()
      .then(setTranscripts)
      .catch(() => setTranscripts([]));

    setupFixture(DEFAULT_TRANSCRIPT_ID, "stub");

    return () => {
      setDriver((current) => {
        current?.destroy();
        return null;
      });
    };
  }, [setupFixture]);

  const handleTranscriptChange = (id: string) => {
    setupFixture(id, generationMode);
  };

  const handleGenerationModeChange = (mode: GenerationMode) => {
    setGenerationMode(mode);
    driver?.setGenerationMode(mode);
  };

  if (loading && !session) {
    return (
      <div className="flex h-dvh items-center justify-center bg-muted text-muted-foreground">
        Loading transcript…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-dvh items-center justify-center bg-muted text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-muted text-foreground">
      <SessionHeader
        mode={view.modeLabel}
        elapsed={view.elapsedLabel}
        onFinish={() => session?.finish()}
        controls={
          driver ? (
            <ReplayControls
              playing={driverState.playing}
              speed={driverState.speed}
              generating={driverState.generating}
              generationMode={generationMode}
              transcripts={transcripts}
              selectedTranscriptId={selectedTranscriptId}
              onPlay={() => driver.play()}
              onPause={() => driver.pause()}
              onReset={() => driver.reset()}
              onSpeedChange={(speed) => driver.setSpeed(speed)}
              onGenerationModeChange={handleGenerationModeChange}
              onTranscriptChange={handleTranscriptChange}
            />
          ) : null
        }
      />

      <div className="flex min-h-0 flex-1">
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-2 md:grid-rows-2 [&>*]:min-h-0">
          {view.cards.map((card) => (
            <SuggestionCard
              key={card.id}
              card={card}
              onDiscard={(itemId) => session?.discardItem(card.id, itemId)}
              onPin={(itemId) => session?.pinItem(card.id, itemId)}
              onUnpin={(itemId) => session?.unpinItem(card.id, itemId)}
              onDone={(itemId) => session?.markDone(card.id, itemId)}
              onUndoDone={(itemId) => session?.unmarkDone(card.id, itemId)}
            />
          ))}
        </main>

        <div className="hidden w-[28%] min-w-[280px] max-w-[420px] shrink-0 md:flex">
          <TranscriptPanel lines={view.transcript} />
        </div>
      </div>
    </div>
  );
}
