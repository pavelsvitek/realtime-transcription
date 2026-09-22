import { useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavHotkeys } from "../hooks/useNavHotkeys";
import { START_MEETING_HOTKEY, STOP_MEETING_HOTKEY } from "../lib/nav-hotkeys";
import { Sidebar, type AppPage } from "./Sidebar";
import {
  StartMeetingConfirmLayer,
  type MeetingConfirmKind,
} from "./StartMeetingConfirm";
import { TitleBar } from "./TitleBar";

interface AppLayoutProps {
  currentPage: AppPage;
  onNavigate: (page: AppPage) => void;
  onStartMeeting: () => void;
  onStopMeeting: () => void;
  listening?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function AppLayout({
  currentPage,
  onNavigate,
  onStartMeeting,
  onStopMeeting,
  listening = false,
  loading = false,
  children,
}: AppLayoutProps) {
  const [confirmKind, setConfirmKind] = useState<MeetingConfirmKind | null>(
    null,
  );
  const confirmOpen = confirmKind !== null;
  useNavHotkeys(onNavigate);
  useHotkey(START_MEETING_HOTKEY, () => setConfirmKind("start"), {
    enabled: !confirmOpen && !listening && !loading,
    meta: {
      name: "Start a meeting",
      description: "Confirm starting a new meeting",
    },
  });
  useHotkey(
    STOP_MEETING_HOTKEY,
    (event) => {
      event.preventDefault();
      setConfirmKind("stop");
    },
    {
      enabled: !confirmOpen && listening,
      preventDefault: true,
      meta: {
        name: "Stop the meeting",
        description: "Confirm stopping the current meeting",
      },
    },
  );

  return (
    <StartMeetingConfirmLayer
      kind={confirmKind}
      onConfirm={() => {
        const kind = confirmKind;
        setConfirmKind(null);
        if (kind === "stop") {
          onStopMeeting();
        } else {
          onStartMeeting();
        }
      }}
      onDismiss={() => setConfirmKind(null)}
    >
      <div className="app-shell">
        <Sidebar
          currentPage={currentPage}
          onNavigate={onNavigate}
          onStartMeeting={onStartMeeting}
          listening={listening}
          loading={loading}
        />
        <div className="app-main">
          <TitleBar></TitleBar>
          <div className="app-content">{children}</div>
        </div>
      </div>
    </StartMeetingConfirmLayer>
  );
}
