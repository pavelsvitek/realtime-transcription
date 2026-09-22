import type { AppPage } from "../components/Sidebar";

export const START_MEETING_HOTKEY = "Mod+N";
export const FOLLOW_UP_MEETING_HOTKEY = "Mod+Shift+N";
export const STOP_MEETING_HOTKEY = "Mod+Backspace";

export type NavHotkey = "Mod+1" | "Mod+2" | "Mod+3" | "Mod+4";

export const NAV_HOTKEYS: {
  page: AppPage;
  hotkey: NavHotkey;
  label: string;
}[] = [
  { page: "home", hotkey: "Mod+1", label: "Home" },
  { page: "transcribe", hotkey: "Mod+2", label: "Transcription" },
  { page: "meetings", hotkey: "Mod+3", label: "Meetings" },
  { page: "settings", hotkey: "Mod+4", label: "Settings" },
];

/** Shared by sidebar Mod+1–4. TanStack has no enableOnFormTags; ignoreInputs: false is the equivalent. */
export const NAV_HOTKEY_OPTIONS = {
  preventDefault: true,
  ignoreInputs: false,
} as const;

/** ARIA keyshortcuts use Control/Meta, not TanStack's Mod token. */
export function ariaKeyshortcutsForMod(hotkey: NavHotkey): string {
  const key = hotkey.slice("Mod+".length);
  return `Meta+${key} Control+${key}`;
}
