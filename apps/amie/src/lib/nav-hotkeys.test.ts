import { describe, expect, it } from "vitest";
import { NAV_HOTKEYS, START_MEETING_HOTKEY, STOP_MEETING_HOTKEY } from "./nav-hotkeys";

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

describe("STOP_MEETING_HOTKEY", () => {
  it("uses Mod+Backspace so Command/Control+Backspace opens the stop confirm", () => {
    expect(STOP_MEETING_HOTKEY).toBe("Mod+Backspace");
  });
});
