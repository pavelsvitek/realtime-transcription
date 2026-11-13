import type { ReactNode } from "react";
import { ThemeToggle } from "./ThemeToggle";
import { useColorScheme } from "../hooks/useColorScheme";
import { LiveMeetingButton } from "./LiveMeetingButton";
import { SIDEBAR_ITEM } from "./sidebar-styles";
import { cn } from "../lib/cn";
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
    <nav
      className="flex w-[240px] shrink-0 flex-col bg-surface-chrome px-3 pb-4"
      aria-label="Main navigation"
    >
      <div
        className="-mx-3 h-[var(--window-chrome-top)] shrink-0"
        data-tauri-drag-region
        aria-hidden="true"
      />
      <div
        className="mb-1 flex items-center gap-2.5 px-1 pt-1 pb-3.5 select-none"
        data-tauri-drag-region
      >
        <img
          src="/amie-icon.png"
          alt=""
          className="size-8 shrink-0"
          width={32}
          height={32}
        />
        <span className="text-[15px] font-[650] tracking-[-0.02em] text-text-primary">
          Amie
        </span>
      </div>
      <ul className="flex min-h-0 flex-1 list-none flex-col gap-1">
        <li className="mb-2">
          <LiveMeetingButton
            className="w-full"
            listening={listening}
            loading={loading}
            disabled={loading && !listening}
            onClick={onStartMeeting}
          />
        </li>
        {NAV_ITEMS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={cn(
                SIDEBAR_ITEM,
                "text-[13px]",
                currentPage === item.id && "text-text-active",
              )}
              onClick={() => onNavigate(item.id)}
              aria-current={currentPage === item.id ? "page" : undefined}
            >
              {item.icon}
              <span className="min-w-0">{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="shrink-0 pt-2">
        <ThemeToggle scheme={scheme} onToggle={toggleScheme} />
      </div>
    </nav>
  );
}
