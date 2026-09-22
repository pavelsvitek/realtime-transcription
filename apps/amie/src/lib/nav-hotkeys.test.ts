import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_MEETING_HOTKEY,
  NAV_HOTKEYS,
  START_MEETING_HOTKEY,
  STOP_MEETING_HOTKEY,
} from "./nav-hotkeys";

describe("NAV_HOTKEYS", () => {
  it("maps Mod+1 through Mod+4 to the sidebar pages", () => {
    expect(NAV_HOTKEYS.map((item) => [item.hotkey, item.page, item.label])).toEqual([
      ["Mod+1", "home", "Home"],
      ["Mod+2", "transcribe", "Transcription"],
      ["Mod+3", "meetings", "Meetings"],
      ["Mod+4", "settings", "Settings"],
    ]);
  });
});

describe("START_MEETING_HOTKEY", () => {
  it("uses Mod+N so Command/Control+N opens the start confirm", () => {
    expect(START_MEETING_HOTKEY).toBe("Mod+N");
  });
});

describe("FOLLOW_UP_MEETING_HOTKEY", () => {
  it("uses Mod+Shift+N so Command/Control+Shift+N opens the follow-up confirm", () => {
    expect(FOLLOW_UP_MEETING_HOTKEY).toBe("Mod+Shift+N");
  });
});

describe("STOP_MEETING_HOTKEY", () => {
  it("uses Mod+Backspace so Command/Control+Backspace opens the stop confirm", () => {
    expect(STOP_MEETING_HOTKEY).toBe("Mod+Backspace");
  });
});
