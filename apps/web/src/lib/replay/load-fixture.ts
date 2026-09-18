import type { StubUpdatesFile } from "@/lib/session/types";
import type { TranscriptFixtureSegment } from "./word-timeline";

export type TranscriptFixture = {
  version: number;
  meta: {
    title: string;
    scenario?: string;
    product_context?: string;
    duration_ms: number;
    created_at?: string;
  };
  speakers: Record<string, { name: string; role?: string }>;
  segments: TranscriptFixtureSegment[];
};

export type TranscriptListItem = {
  id: string;
  title: string;
  durationMs: number;
};

export type LoadedFixture = {
  fixture: TranscriptFixture;
  stubUpdates: StubUpdatesFile;
};

export async function listTranscripts(): Promise<TranscriptListItem[]> {
  const response = await fetch("/api/transcripts");
  if (!response.ok) {
    throw new Error("Failed to list transcripts");
  }
  return response.json() as Promise<TranscriptListItem[]>;
}

export async function loadFixture(id: string): Promise<LoadedFixture> {
  const response = await fetch(`/api/transcripts/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to load transcript: ${id}`);
  }
  return response.json() as Promise<LoadedFixture>;
}
