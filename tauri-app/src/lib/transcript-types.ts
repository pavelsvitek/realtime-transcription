export type AudioSource = "mic" | "system";

export type TranscriptSegment = {
  id: string;
  speaker: string;
  text: string;
  isPartial: boolean;
  startMs: number;
};

export type TranscriptPayload = {
  speaker: string;
  stream: string;
  text: string;
  startMs: number;
  endMs: number;
  segmentId: string;
};

export type TranscriptionStatusPayload = {
  active: boolean;
  loading?: boolean;
  model?: string;
  error?: string;
};

export type MicLevelPayload = {
  rms: number;
};
