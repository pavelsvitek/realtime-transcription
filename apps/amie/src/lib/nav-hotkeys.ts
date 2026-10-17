import type { AppPage } from "../components/Sidebar";

export const START_MEETING_HOTKEY = "Mod+N";
export const FOLLOW_UP_MEETING_HOTKEY = "Mod+Shift+N";
export const ARCHIVE_MEETING_HOTKEY = "Mod+E";
export const STOP_MEETING_HOTKEY = "Mod+Backspace";
/** macOS-style preferences shortcut (Command/Control+,). */
export const SETTINGS_HOTKEY = "Mod+,";

export const NAV_HOTKEYS: {
  page: AppPage;
  hotkey: "Mod+1" | "Mod+2" | "Mod+3" | "Mod+4" | "Mod+,";
  label: string;
}[] = [
  { page: "home", hotkey: "Mod+1", label: "Home" },
  { page: "transcribe", hotkey: "Mod+2", label: "Transcription" },
  { page: "meetings", hotkey: "Mod+3", label: "Meetings" },
  { page: "settings", hotkey: "Mod+4", label: "Settings" },
  { page: "settings", hotkey: "Mod+,", label: "Settings" },
];
