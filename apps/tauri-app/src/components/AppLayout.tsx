import { useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavHotkeys } from "../hooks/useNavHotkeys";
import { START_MEETING_HOTKEY } from "../lib/nav-hotkeys";
import { Sidebar, type AppPage } from "./Sidebar";
import { StartMeetingConfirmLayer } from "./StartMeetingConfirm";
import { TitleBar } from "./TitleBar";

interface AppLayoutProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onStartMeeting: () => void;
  children: ReactNode;
}

export function AppLayout({
  currentPage,
  onNavigate,
  onStartMeeting,
  children,
}: AppLayoutProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  useNavHotkeys(onNavigate);
  useHotkey(START_MEETING_HOTKEY, () => setConfirmOpen(true), {
    enabled: !confirmOpen,
    meta: {
      name: "Start a meeting",
      description: "Confirm starting a new meeting",
    },
  });

  return (
    <StartMeetingConfirmLayer
      open={confirmOpen}
      onConfirm={() => {
        setConfirmOpen(false);
        onStartMeeting();
      }}
      onDismiss={() => setConfirmOpen(false)}
    >
      <div className="app-shell">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          onStartMeeting={onStartMeeting}
        />
        <div className="app-main">
          <TitleBar></TitleBar>
          <div className="app-content">{children}</div>
        </div>
      </div>
    </StartMeetingConfirmLayer>
  );
}
