import { invoke } from "@tauri-apps/api/core";
import { getLiveMeeting, getMeeting } from "../models/Meeting";
import { meetingSegmentsToTranscript } from "./transcript-timeline";
import type {
  AsrBackend,
  AudioSource,
  TranscriptSegment,
  TranscriptionSnapshot,
} from "./transcript-types";

export type RestoredLiveTranscription = {
  active: boolean;
  loading: boolean;
  model: string | null;
  source: AudioSource | null;
  backend: AsrBackend | null;
  segments: TranscriptSegment[];
};

export async function restoreLiveTranscription(): Promise<RestoredLiveTranscription> {
  const snapshot = await invoke<TranscriptionSnapshot>("get_transcription_status");
  const idle: RestoredLiveTranscription = {
    active: false,
    loading: snapshot.loading ?? false,
    model: snapshot.model ?? null,
    source: snapshot.source ?? null,
    backend: snapshot.backend ?? null,
    segments: [],
  };
  if (!snapshot.active) {
    return idle;
  }

  const meetingId = snapshot.meetingId;
  const live = meetingId ? null : await getLiveMeeting();
  const id = meetingId ?? live?.id ?? null;
  let segments: TranscriptSegment[] = [];
  if (id) {
    const record = await getMeeting(id);
    if (record) {
      segments = meetingSegmentsToTranscript(record.segments);
    }
  }

  return {
    active: true,
    loading: snapshot.loading ?? false,
    model: snapshot.model ?? null,
    source: snapshot.source ?? null,
    backend: snapshot.backend ?? null,
    segments,
  };
}
