import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useColorScheme } from "../hooks/useColorScheme";
import { LiveMeetingButton } from "./LiveMeetingButton";
import {
  ariaKeyshortcutsForMod,
  NAV_HOTKEYS,
} from "../lib/nav-hotkeys";
import {
  HomeIcon,
  MeetingsIcon,
  SettingsIcon,
  TranscriptionIcon,
} from "./sidebar-icons";

export type AppPage = "home" | "transcribe" | "meetings" | "settings";

const NAV_ICONS: Record<AppPage, ReactNode> = {
  home: <HomeIcon />,
  transcribe: <TranscriptionIcon />,
  meetings: <MeetingsIcon />,
  settings: <SettingsIcon />,
};

interface SidebarProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onStartMeeting: () => void;
  listening?: boolean;
  loading?: boolean;
}

export function Sidebar({
  currentPage,
  onNavigate,
  onStartMeeting,
  listening = false,
  loading = false,
}: SidebarProps) {
  const { scheme, toggleScheme } = useColorScheme();

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="sidebar-chrome" data-tauri-drag-region aria-hidden="true" />
      <div className="sidebar-brand" data-tauri-drag-region>
        <img
          src="/amie-icon.png"
          alt=""
          className="sidebar-brand-icon"
          width={32}
          height={32}
        />
        <span className="sidebar-brand-name">Amie</span>
      </div>
      <ul className="sidebar-nav">
        <li className="sidebar-start-item">
          <LiveMeetingButton
            className="sidebar-start-meeting"
            listening={listening}
            loading={loading}
            disabled={loading && !listening}
            onClick={onStartMeeting}
          />
        </li>
        {NAV_HOTKEYS.map((item) => (
          <li key={item.page}>
            <button
              type="button"
              className={`sidebar-link${currentPage === item.page ? " active" : ""}`}
              onClick={() => onNavigate(item.page)}
              aria-current={currentPage === item.page ? "page" : undefined}
              aria-keyshortcuts={ariaKeyshortcutsForMod(item.hotkey)}
            >
              {NAV_ICONS[item.page]}
              <span className="sidebar-link-label">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <ThemeToggle scheme={scheme} onToggle={toggleScheme} />
      </div>
    </nav>
  );
}
