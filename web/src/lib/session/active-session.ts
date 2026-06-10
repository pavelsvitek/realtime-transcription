import { formatElapsed } from "./format";
import { getModeDefinition } from "./modes";
import type {
  ActiveSession,
  CardUpdate,
  CreateSessionInput,
  GenerationContext,
  ItemDisposition,
  SessionRecord,
  SessionView,
  TranscriptIngress,
} from "./types";

const LIVE_VISIBLE_CAP = 10;
const RECENT_TRANSCRIPT_MS = 180_000;

type InternalItem = {
  id: string;
  cardId: string;
  text: string;
  rationale: string;
  disposition: ItemDisposition;
  createdAtMs: number;
  discardedAtMs?: number;
  resurfaced?: boolean;
};

type InternalTranscriptLine = {
  id: string;
  speakerKey: string;
  speaker: string;
  text: string;
  atMs: number;
  isPartial: boolean;
};

let itemCounter = 0;

function nextItemId(): string {
  itemCounter += 1;
  return `item-${itemCounter}`;
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createActiveSession(input: CreateSessionInput): ActiveSession {
  const modeDef = getModeDefinition(input.mode);
  const speakers = input.speakers ?? {};
  const sessionId = createSessionId();

  let status: SessionView["status"] = "live";
  let startedAt = new Date().toISOString();
  let elapsedMs = 0;
  let transcript: InternalTranscriptLine[] = [];
  let items: InternalItem[] = [];
  const listeners = new Set<() => void>();
  let cachedView: SessionView;

  function resolveSpeaker(speakerKey: string): string {
    return speakers[speakerKey]?.name ?? speakerKey;
  }

  function buildView(): SessionView {
    const cards = modeDef.cards.map((cardDef) => ({
      id: cardDef.id,
      title: cardDef.title,
      items: items
        .filter(
          (item) =>
            item.cardId === cardDef.id &&
            item.disposition !== "discarded",
        )
        .slice(-LIVE_VISIBLE_CAP)
        .map((item) => ({
          id: item.id,
          text: item.text,
          rationale: item.rationale,
          disposition:
            item.disposition === "discarded" ? "active" : item.disposition,
        })),
    }));

    return {
      status,
      mode: input.mode,
      modeLabel: modeDef.label,
      title: input.title ?? modeDef.label,
      elapsedMs,
      elapsedLabel: formatElapsed(elapsedMs),
      transcript: transcript.map((line) => ({
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        atMs: line.atMs,
        timeLabel: formatElapsed(line.atMs),
        isPartial: line.isPartial,
      })),
      cards,
    };
  }

  function refreshView(): void {
    cachedView = buildView();
  }

  function notify(): void {
    refreshView();
    for (const listener of listeners) {
      listener();
    }
  }

  function setItemDisposition(
    cardId: string,
    itemId: string,
    disposition: ItemDisposition,
  ): void {
    const item = items.find((i) => i.id === itemId && i.cardId === cardId);
    if (!item) return;

    item.disposition = disposition;
    if (disposition === "discarded") {
      item.discardedAtMs = elapsedMs;
    }
    notify();
  }

  const session: ActiveSession = {
    sessionId,

    start() {
      status = "live";
      startedAt = new Date().toISOString();
      elapsedMs = 0;
      transcript = [];
      items = [];
      notify();
    },

    reset() {
      status = "live";
      elapsedMs = 0;
      transcript = [];
      items = [];
      notify();
    },

    finish(): SessionRecord {
      status = "finished";
      const finishedAt = new Date().toISOString();
      const view = buildView();

      const record: SessionRecord = {
        sessionId,
        mode: input.mode,
        title: view.title,
        startedAt,
        finishedAt,
        durationMs: elapsedMs,
        transcript: view.transcript,
        cards: modeDef.cards.map((cardDef) => ({
          id: cardDef.id,
          title: cardDef.title,
          items: items
            .filter((item) => item.cardId === cardDef.id)
            .map((item) => ({
              id: item.id,
              text: item.text,
              rationale: item.rationale,
              disposition: item.disposition,
              createdAtMs: item.createdAtMs,
              discardedAtMs: item.discardedAtMs,
              resurfaced: item.resurfaced,
            })),
        })),
      };

      notify();
      return record;
    },

    getView() {
      return cachedView;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setElapsed(ms) {
      elapsedMs = ms;
      notify();
    },

    appendTranscript(ingress: TranscriptIngress) {
      const isFinal = ingress.final ?? true;
      const existing = transcript.find((line) => line.id === ingress.id);

      if (existing) {
        existing.text = ingress.text;
        existing.isPartial = !isFinal;
        existing.atMs = ingress.startMs;
        existing.speaker = resolveSpeaker(ingress.speakerKey);
      } else {
        transcript.push({
          id: ingress.id,
          speakerKey: ingress.speakerKey,
          speaker: resolveSpeaker(ingress.speakerKey),
          text: ingress.text,
          atMs: ingress.startMs,
          isPartial: !isFinal,
        });
      }

      notify();
    },

    applyCardUpdates(updates: CardUpdate[]) {
      for (const update of updates) {
        for (const op of update.ops) {
          if (op.kind === "append") {
            items.push({
              id: nextItemId(),
              cardId: update.cardId,
              text: op.text,
              rationale: op.rationale,
              disposition: "active",
              createdAtMs: elapsedMs,
            });
          } else if (op.kind === "revise") {
            const item = items.find(
              (i) => i.id === op.itemId && i.cardId === update.cardId,
            );
            if (item) {
              item.text = op.text;
              item.rationale = op.rationale;
            }
          }
        }
      }
      notify();
    },

    pinItem(cardId, itemId) {
      setItemDisposition(cardId, itemId, "pinned");
    },

    discardItem(cardId, itemId) {
      setItemDisposition(cardId, itemId, "discarded");
    },

    markDone(cardId, itemId) {
      setItemDisposition(cardId, itemId, "done");
    },

    getGenerationContext(): GenerationContext {
      const view = buildView();
      const cutoff = elapsedMs - RECENT_TRANSCRIPT_MS;

      return {
        mode: input.mode,
        title: view.title,
        elapsedMs,
        recentTranscript: view.transcript.filter((line) => line.atMs >= cutoff),
        cards: modeDef.cards.map((cardDef) => ({
          id: cardDef.id,
          title: cardDef.title,
          activeItems: items
            .filter(
              (item) =>
                item.cardId === cardDef.id &&
                item.disposition !== "discarded",
            )
            .map((item) => ({
              id: item.id,
              text: item.text,
              rationale: item.rationale,
            })),
          suppressedTopics: items
            .filter(
              (item) =>
                item.cardId === cardDef.id &&
                item.disposition === "discarded",
            )
            .map((item) => item.text),
        })),
      };
    },
  };

  refreshView();
  session.start();

  return session;
}
