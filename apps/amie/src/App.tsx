import { Activity, useRef, useState } from "react";
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
  const startMeetingRef = useRef<(() => void) | null>(null);

  return (
    <AppLayout
      currentPage={page}
      onNavigate={setPage}
      onStartMeeting={() => {
        setPage("transcribe");
        startMeetingRef.current?.();
      }}
    >
      {page === "home" ? <HomePage /> : null}
      <Activity mode={page === "transcribe" ? "visible" : "hidden"}>
        <TranscribePage
          startMeetingRef={startMeetingRef}
          onMeetingFinished={(meetingId) => {
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
