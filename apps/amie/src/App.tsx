import { Activity, useCallback, useRef, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import "./App.css";

function App() {
  const [page, setPage] = useState<AppPage>("transcribe");
  const [arrivedMeetingId, setArrivedMeetingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const startMeetingRef = useRef<(() => void) | null>(null);
  const handleLiveSessionChange = useCallback(
    (session: { listening: boolean; loading: boolean }) => {
      setListening(session.listening);
      setStarting(session.loading);
    },
    [],
  );

  return (
    <AppLayout
      currentPage={page}
      onNavigate={setPage}
      listening={listening}
      loading={starting}
      onStartMeeting={() => {
        setPage("transcribe");
        if (listening || starting) return;
        startMeetingRef.current?.();
      }}
    >
      {page === "home" ? <HomePage /> : null}
      <Activity mode={page === "transcribe" ? "visible" : "hidden"}>
        <TranscribePage
          startMeetingRef={startMeetingRef}
          onLiveSessionChange={handleLiveSessionChange}
          onMeetingFinished={(meetingId) => {
            setListening(false);
            setStarting(false);
            setArrivedMeetingId(meetingId);
            setPage("meetings");
          }}
        />
      </Activity>
      {page === "meetings" ? (
        <MeetingsPage arrivedMeetingId={arrivedMeetingId} />
      ) : null}
      {page === "settings" ? <SettingsPage /> : null}
    </AppLayout>
  );
}

export default App;
