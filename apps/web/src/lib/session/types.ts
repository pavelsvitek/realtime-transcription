export type SessionMode = "customer_interview";

export type SessionStatus = "live" | "finished";

export type ItemDisposition = "active" | "pinned" | "done" | "discarded";

export type TranscriptLine = {
  id: string;
  speaker: string;
  text: string;
  atMs: number;
  timeLabel: string;
  isPartial?: boolean;
};

export type ItemView = {
  id: string;
  text: string;
  rationale: string;
  disposition: ItemDisposition;
};

export type CardView = {
  id: string;
  title: string;
  items: ItemView[];
};

export type SessionView = {
  status: SessionStatus;
  mode: SessionMode;
  modeLabel: string;
  title: string;
  elapsedMs: number;
  elapsedLabel: string;
  transcript: TranscriptLine[];
  cards: CardView[];
};

export type TranscriptIngress = {
  id: string;
  speakerKey: string;
  text: string;
  startMs: number;
  final?: boolean;
};

export type CardUpdateOp =
  | { kind: "append"; text: string; rationale: string }
  | { kind: "revise"; itemId: string; text: string; rationale: string };

export type CardUpdate = {
  cardId: string;
  ops: CardUpdateOp[];
};

export type SessionContext = {
  goal?: string;
  participantSegment?: string;
  hypothesis?: string;
  additionalContext?: string;
};

export type SuggestionItemState = {
  id: string;
  text: string;
  rationale: string;
  disposition: ItemDisposition;
};

export type TranscriptChunkLine = {
  speaker: string;
  text: string;
  atMs: number;
};

export type GenerateSuggestionsRequest = {
  mode: SessionMode;
  sessionContext?: SessionContext;
  cards: Array<{
    id: string;
    title: string;
    items: SuggestionItemState[];
  }>;
  transcriptChunk: TranscriptChunkLine[];
};

export type GeneratedSuggestion = {
  cardId: string;
  text: string;
  rationale: string;
};

export type GenerateSuggestionsResponse = {
  items: GeneratedSuggestion[];
};

export type GenerationMode = "stub" | "llm";

export type GenerationContext = {
  mode: SessionMode;
  title: string;
  elapsedMs: number;
  recentTranscript: TranscriptLine[];
  cards: Array<{
    id: string;
    title: string;
    activeItems: Array<{ id: string; text: string; rationale: string }>;
    suppressedTopics: string[];
  }>;
};

export type SessionRecord = {
  sessionId: string;
  mode: SessionMode;
  title: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  transcript: TranscriptLine[];
  cards: Array<{
    id: string;
    title: string;
    items: Array<
      ItemView & {
        createdAtMs: number;
        discardedAtMs?: number;
        resurfaced?: boolean;
      }
    >;
  }>;
};

export type CreateSessionInput = {
  mode: SessionMode;
  title?: string;
  speakers?: Record<string, { name: string; role?: string }>;
  sessionContext?: SessionContext;
};

export type StubUpdatesFile = {
  triggers: Array<{
    afterSegmentId: string;
    updates: CardUpdate[];
  }>;
};

export type DispositionSnapshot = {
  cardId: string;
  text: string;
  createdAtMs: number;
  disposition: ItemDisposition;
  actionAtMs: number;
};

export interface ActiveSession {
  readonly sessionId: string;

  start(): void;
  finish(): SessionRecord;
  reset(): void;

  getView(): SessionView;
  subscribe(listener: () => void): () => void;

  setElapsed(ms: number): void;
  appendTranscript(segment: TranscriptIngress): void;
  applyCardUpdates(updates: CardUpdate[]): void;

  pinItem(cardId: string, itemId: string): void;
  unpinItem(cardId: string, itemId: string): void;
  discardItem(cardId: string, itemId: string): void;
  markDone(cardId: string, itemId: string): void;
  unmarkDone(cardId: string, itemId: string): void;

  captureDispositionSnapshots(): DispositionSnapshot[];
  reapplyDispositionSnapshots(
    snapshots: DispositionSnapshot[],
    atMs: number,
  ): void;

  getGenerationContext(): GenerationContext;
  buildGenerateRequest(): GenerateSuggestionsRequest;
  getLatestFinalizedTranscriptAtMs(): number;
  getNewWordCountSince(sinceMs: number): number;
}
