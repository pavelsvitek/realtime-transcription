import type { ReactNode } from "react";
import {
  HomeIcon,
  MeetingsIcon,
  SettingsIcon,
  TranscriptionIcon,
} from "./sidebar-icons";

export type AppPage = "home" | "transcribe" | "meetings" | "settings";

const NAV_ITEMS: { id: AppPage; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "transcribe", label: "Transcription", icon: <TranscriptionIcon /> },
  { id: "meetings", label: "Meetings", icon: <MeetingsIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
];

interface SidebarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-chrome" data-tauri-drag-region aria-hidden="true" />
      <div className="sidebar-brand">tauri-app</div>
      <ul className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`sidebar-link${currentPage === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
              aria-current={currentPage === item.id ? "page" : undefined}
            >
              {item.icon}
              <span className="sidebar-link-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
