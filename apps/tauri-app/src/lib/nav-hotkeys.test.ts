import { describe, expect, it } from "vitest";
import { NAV_HOTKEYS } from "./nav-hotkeys";

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
