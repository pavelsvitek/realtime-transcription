import { describe, expect, it, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { patchMeeting, deleteMeeting } from "./mutations";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("patchMeeting", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue({
      meeting: {
        id: "m1",
        startedAt: 1,
        finishedAt: null,
        title: "Weekly sync",
        teaser: null,
        summary: null,
        status: "live",
        context: "Pavel",
      },
      segments: [],
    });
  });

  it("invokes patch_meeting with only provided keys", async () => {
    await patchMeeting("m1", { title: "Weekly sync" });
    expect(mockedInvoke).toHaveBeenCalledWith("patch_meeting", {
      id: "m1",
      payload: { title: "Weekly sync" },
    });
  });

  it("sends empty context to clear", async () => {
    await patchMeeting("m1", { context: null });
    expect(mockedInvoke).toHaveBeenCalledWith("patch_meeting", {
      id: "m1",
      payload: { context: "" },
    });
  });

  it("sends summary for a follow-up copy", async () => {
    await patchMeeting("m1", { summary: "Ship it" });
    expect(mockedInvoke).toHaveBeenCalledWith("patch_meeting", {
      id: "m1",
      payload: { summary: "Ship it" },
    });
  });

  it("sends archivedAt for archive", async () => {
    await patchMeeting("m1", { archivedAt: 1_700 });
    expect(mockedInvoke).toHaveBeenCalledWith("patch_meeting", {
      id: "m1",
      payload: { archivedAt: 1_700 },
    });
  });
});

describe("deleteMeeting", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
    mockedInvoke.mockResolvedValue(undefined);
  });

  it("invokes delete_meeting", async () => {
    await deleteMeeting("m1");
    expect(mockedInvoke).toHaveBeenCalledWith("delete_meeting", { id: "m1" });
  });
});
