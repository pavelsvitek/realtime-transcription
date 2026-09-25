export type AudioSource = "mic" | "system" | "both";

export type AsrBackend = "local" | "xai";

export type AsrSettings = {
  backendOptions: string[];
  xaiApiKeySet: boolean;
  xaiApiKeySaved: boolean;
  xaiApiKeyFromEnv: boolean;
};

export type SummaryProvider = "xai" | "openai" | "gemini";

export type SummarySettings = {
  provider: SummaryProvider;
  providerFromEnv: boolean;
  openaiApiKeySet: boolean;
  openaiApiKeySaved: boolean;
  openaiApiKeyFromEnv: boolean;
  geminiApiKeySet: boolean;
  geminiApiKeySaved: boolean;
  geminiApiKeyFromEnv: boolean;
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

export type TranscriptionSnapshot = TranscriptionStatusPayload & {
  source?: AudioSource;
  backend?: AsrBackend;
  meetingId?: string;
};

export type MicLevelPayload = {
  rms: number;
};

export type DeviceKind =
  | "builtInMic"
  | "wiredHeadset"
  | "bluetoothEarbuds"
  | "bluetoothHeadphones"
  | "bluetoothGeneric"
  | "usbHeadset"
  | "unknown";

export type AudioDeviceInfo = {
  name: string;
  kind: DeviceKind;
  transport: string;
};

export type AudioDevicePayload = {
  device: AudioDeviceInfo;
};

export type MeetingApp = "zoom" | "teams";

export type SpeakerTagsStatus = {
  trusted: boolean;
  meetingApp: MeetingApp | null;
};
