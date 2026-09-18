import { describe, expect, it } from "vitest";
import type { TranscriptPayload } from "./transcript-types";
import { applyCommit, applyTranscriptEvent } from "./transcript-timeline";

function commit(
  id: string,
  text: string,
  startMs: number,
  endMs: number,
  stream = "mic",
): TranscriptPayload {
  return {
    segmentId: id,
    speaker: stream === "mic" ? "User" : "Remote",
    stream,
    text,
    startMs,
    endMs,
  };
}

describe("applyCommit coalesce guard", () => {
  it("merges when gap is a small positive refinement window", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "hello", 0, 1000),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "world", 1200, 2000),
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe("hello world");
    expect(segments[0]?.endMs).toBe(2000);
  });

  it("does not merge adjacent chunks with micro-gap from timestamp rounding", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "first chunk", 10_100, 20_000),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "second chunk", 20_007, 40_007),
    );

    expect(segments).toHaveLength(2);
  });

  it("does not merge adjacent chunks with zero gap", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "first chunk", 0, 30_000),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "second chunk", 30_000, 60_000),
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe("first chunk");
    expect(segments[1]?.text).toBe("second chunk");
  });

  it("does not merge when timestamps overlap (negative gap)", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "first", 0, 20_018),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "second", 2_000, 22_018),
    );

    expect(segments).toHaveLength(2);
  });

  it("does not merge when pause exceeds coalesce threshold", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "before pause", 0, 5_000),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "after pause", 8_000, 12_000),
    );

    expect(segments).toHaveLength(2);
  });

  it("does not merge across streams even with small gap", () => {
    let segments = applyCommit(
      [],
      commit("seg-0", "user line", 0, 1_000, "mic"),
    );
    segments = applyCommit(
      segments,
      commit("seg-1", "remote line", 1_100, 2_000, "system"),
    );

    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.stream)).toEqual(["mic", "system"]);
  });

  it("keeps separate lines for many adjacent ASR commits (regression)", () => {
    let segments: ReturnType<typeof applyCommit> = [];
    const chunkMs = 30_000;
    const commitCount = 84;

    for (let i = 0; i < commitCount; i++) {
      const startMs = i * chunkMs;
      segments = applyCommit(
        segments,
        commit(`seg-${i}`, `chunk ${i}`, startMs, startMs + chunkMs),
      );
    }

    expect(segments).toHaveLength(commitCount);
    expect(segments[0]?.startMs).toBe(0);
    expect(segments.at(-1)?.endMs).toBe(commitCount * chunkMs);
  });
});

describe("applyTranscriptEvent", () => {
  it("replaces tentative partial before committing on the same stream", () => {
    const partial: TranscriptPayload = {
      segmentId: "tentative-mic",
      speaker: "User",
      stream: "mic",
      text: "hel",
      startMs: 0,
      endMs: 500,
    };

    let segments = applyTranscriptEvent([], partial, "partial");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.isPartial).toBe(true);

    segments = applyTranscriptEvent(
      segments,
      commit("seg-0", "hello", 0, 1000),
      "commit",
    );

    expect(segments).toHaveLength(1);
    expect(segments[0]?.isPartial).toBe(false);
    expect(segments[0]?.text).toBe("hello");
  });

  it("keeps a zero-start live partial after already committed sentences", () => {
    // Replay of 2026-09-14T13-01-38: xAI chunk/interim often has start=0.
    let segments = applyTranscriptEvent(
      [],
      commit(
        "seg-0",
        "This is a test of XAI API real-time Voice to Text transcription service.",
        1520,
        13279,
      ),
      "commit",
    );

    segments = applyTranscriptEvent(
      segments,
      {
        segmentId: "tentative-mic",
        speaker: "User",
        stream: "mic",
        text: "It seems that some of the sentences are being overwritten",
        startMs: 0,
        endMs: 800,
      },
      "partial",
    );

    expect(segments.map((s) => s.text)).toEqual([
      "This is a test of XAI API real-time Voice to Text transcription service.",
      "It seems that some of the sentences are being overwritten",
    ]);
    expect(segments[1]?.isPartial).toBe(true);
  });

  it("replaces the live partial in place without jumping it before commits", () => {
    let segments = applyTranscriptEvent(
      [],
      commit("seg-0", "first sentence", 1520, 13279),
      "commit",
    );
    segments = applyTranscriptEvent(
      segments,
      {
        segmentId: "tentative-mic",
        speaker: "User",
        stream: "mic",
        text: "It seems",
        startMs: 15241,
        endMs: 16000,
      },
      "partial",
    );
    segments = applyTranscriptEvent(
      segments,
      {
        segmentId: "tentative-mic",
        speaker: "User",
        stream: "mic",
        text: "It seems that some of the sentences",
        startMs: 0,
        endMs: 500,
      },
      "partial",
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe("first sentence");
    expect(segments[1]?.text).toBe("It seems that some of the sentences");
    expect(segments[1]?.isPartial).toBe(true);
  });
});
