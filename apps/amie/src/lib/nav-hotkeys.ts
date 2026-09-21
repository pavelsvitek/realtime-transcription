import type { AppPage } from "../components/Sidebar";

export const START_MEETING_HOTKEY = "Mod+N";

export const NAV_HOTKEYS: {
  page: AppPage;
  hotkey: "Mod+1" | "Mod+2" | "Mod+3" | "Mod+4";
  label: string;
}[] = [
  { page: "home", hotkey: "Mod+1", label: "Home" },
  { page: "transcribe", hotkey: "Mod+2", label: "Transcription" },
  { page: "meetings", hotkey: "Mod+3", label: "Meetings" },
  { page: "settings", hotkey: "Mod+4", label: "Settings" },
];
