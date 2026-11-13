import { useState, type ReactNode } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavHotkeys } from "../hooks/useNavHotkeys";
import { cn } from "../lib/cn";
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
  /** Start a meeting is off (button and ⌘N), e.g. while the setup wizard runs. */
  startDisabled?: boolean;
  children: ReactNode;
}

export function AppLayout({
  currentPage,
  onNavigate,
  onStartMeeting,
  onStopMeeting,
  listening = false,
  loading = false,
  startDisabled = false,
  children,
}: AppLayoutProps) {
  const [confirmKind, setConfirmKind] = useState<MeetingConfirmKind | null>(
    null,
  );
  const [heldOpen, setHeldOpen] = useState(false);
  const confirmOpen = confirmKind !== null || heldOpen;
  const settingsOpen = currentPage === "settings";
  useNavHotkeys(onNavigate, !settingsOpen);
  useHotkey(START_MEETING_HOTKEY, () => setConfirmKind("start"), {
    enabled: !settingsOpen && !confirmOpen && !listening && !loading && !startDisabled,
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
      enabled: !settingsOpen && !confirmOpen && listening,
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
      onHoldChange={setHeldOpen}
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
      <div className="flex h-full overflow-hidden bg-surface-shell">
        {!settingsOpen ? (
          <Sidebar
            currentPage={currentPage}
            onNavigate={onNavigate}
            onStartMeeting={onStartMeeting}
            listening={listening}
            loading={loading}
            startDisabled={startDisabled}
          />
        ) : null}
        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-chrome",
            settingsOpen && "bg-surface-content",
          )}
        >
          {!settingsOpen ? <TitleBar /> : null}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden rounded-tl-xl bg-surface-content text-text-primary",
              settingsOpen && "rounded-tl-none",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </StartMeetingConfirmLayer>
  );
}
