import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { restoreLiveTranscription } from "./restore-live-transcription";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("restoreLiveTranscription", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("returns idle state when no session is running", async () => {
    mockedInvoke.mockResolvedValueOnce({ active: false });
    await expect(restoreLiveTranscription()).resolves.toEqual({
      active: false,
      loading: false,
      model: null,
      source: null,
      backend: null,
      segments: [],
    });
    expect(mockedInvoke).toHaveBeenCalledWith("get_transcription_status");
    expect(mockedInvoke).toHaveBeenCalledTimes(1);
  });

  it("reloads committed segments for the live meeting", async () => {
    mockedInvoke.mockImplementation(async (command, args) => {
      if (command === "get_transcription_status") {
        return {
          active: true,
          model: "xAI Transcribe 2.0",
          source: "both",
          backend: "xai",
          meetingId: "m1",
        };
      }
      if (command === "get_meeting") {
        expect(args).toEqual({ id: "m1" });
        return {
          meeting: { id: "m1" },
          segments: [
            { id: "m1:seg-0", startMs: 0, endMs: 800, text: "hello" },
            { id: "m1:seg-1", startMs: 900, endMs: 1500, text: "there" },
          ],
        };
      }
      throw new Error(`unexpected command ${String(command)}`);
    });

    const restored = await restoreLiveTranscription();
    expect(restored.active).toBe(true);
    expect(restored.model).toBe("xAI Transcribe 2.0");
    expect(restored.source).toBe("both");
    expect(restored.backend).toBe("xai");
    expect(restored.segments.map((s) => s.id)).toEqual(["seg-0", "seg-1"]);
    expect(restored.segments.map((s) => s.text)).toEqual(["hello", "there"]);
  });
});
