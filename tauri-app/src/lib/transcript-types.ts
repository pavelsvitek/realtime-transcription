export type AudioSource = "mic" | "system" | "both";

export type TranscriptionModel = {
  id: string;
  name: string;
  available: boolean;
  unavailableReason?: string;
};


export type TranscriptSegment = {
  id: string;
  speaker: string;
  stream: "mic" | "system";
  text: string;
  isPartial: boolean;
  startMs: number;
  endMs: number;
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
