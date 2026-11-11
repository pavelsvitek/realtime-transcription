import { describe, expect, it } from "vitest";
import {
  ARCHIVE_MEETING_HOTKEY,
  FOLLOW_UP_MEETING_HOTKEY,
  moveSettingsSection,
  NAV_HOTKEYS,
  SETTINGS_HOTKEY,
  START_MEETING_HOTKEY,
  STOP_MEETING_HOTKEY,
} from "./nav-hotkeys";

describe("NAV_HOTKEYS", () => {
  it("maps Mod+1 through Mod+4 and Mod+, to the sidebar pages", () => {
    expect(NAV_HOTKEYS.map((item) => [item.hotkey, item.page, item.label])).toEqual([
      ["Mod+1", "home", "Home"],
      ["Mod+2", "transcribe", "Transcription"],
      ["Mod+3", "meetings", "Meetings"],
      ["Mod+4", "settings", "Settings"],
      ["Mod+,", "settings", "Settings"],
    ]);
  });
});

describe("SETTINGS_HOTKEY", () => {
  it("uses Mod+, so Command/Control+, opens Settings", () => {
    expect(SETTINGS_HOTKEY).toBe("Mod+,");
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

describe("ARCHIVE_MEETING_HOTKEY", () => {
  it("uses Mod+E so Command/Control+E opens the archive confirm", () => {
    expect(ARCHIVE_MEETING_HOTKEY).toBe("Mod+E");
  });
});

describe("STOP_MEETING_HOTKEY", () => {
  it("uses Mod+Backspace so Command/Control+Backspace opens the stop confirm", () => {
    expect(STOP_MEETING_HOTKEY).toBe("Mod+Backspace");
  });
});

describe("moveSettingsSection", () => {
  const items = ["meeting-summary", "mcp", "system-access"] as const;

  it("moves down and up without wrapping", () => {
    expect(moveSettingsSection(items, "meeting-summary", "down")).toBe("mcp");
    expect(moveSettingsSection(items, "mcp", "down")).toBe("system-access");
    expect(moveSettingsSection(items, "system-access", "down")).toBe("system-access");
    expect(moveSettingsSection(items, "system-access", "up")).toBe("mcp");
    expect(moveSettingsSection(items, "meeting-summary", "up")).toBe("meeting-summary");
  });
});
