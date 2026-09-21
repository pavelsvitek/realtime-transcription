import { describe, expect, it, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getAllMeetings, getMeeting, getLiveMeeting, meetingKeys } from "./queries";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("meetingKeys", () => {
  it("nests list, detail, and live under meetings", () => {
    expect(meetingKeys.all).toEqual(["meetings"]);
    expect(meetingKeys.list()).toEqual(["meetings", "list"]);
    expect(meetingKeys.detail("m1")).toEqual(["meetings", "detail", "m1"]);
    expect(meetingKeys.live()).toEqual(["meetings", "live"]);
  });
});

describe("meeting query functions", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("getAllMeetings invokes get_all_meetings", async () => {
    mockedInvoke.mockResolvedValue([]);
    await getAllMeetings();
    expect(mockedInvoke).toHaveBeenCalledWith("get_all_meetings");
  });

  it("getMeeting invokes get_meeting and allows null", async () => {
    mockedInvoke.mockResolvedValue(null);
    await expect(getMeeting("missing")).resolves.toBeNull();
    expect(mockedInvoke).toHaveBeenCalledWith("get_meeting", { id: "missing" });
  });

  it("getLiveMeeting invokes get_live_meeting", async () => {
    mockedInvoke.mockResolvedValue(null);
    await getLiveMeeting();
    expect(mockedInvoke).toHaveBeenCalledWith("get_live_meeting");
  });
});
