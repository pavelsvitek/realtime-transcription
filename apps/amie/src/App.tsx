import { Activity, useCallback, useRef, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import { OnboardingProvider } from "./components/OnboardingProvider";
import type { AppPage } from "./components/Sidebar";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import type { FollowUpSeed } from "./lib/meetings";
import "./App.css";

function App() {
  const [page, setPage] = useState<AppPage>("transcribe");
  const lastMainPageRef = useRef<Exclude<AppPage, "settings">>("transcribe");
  const [arrivedMeetingId, setArrivedMeetingId] = useState<string | null>(null);
  const [skipAutoSummaryNotice, setSkipAutoSummaryNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const startMeetingRef = useRef<(() => void) | null>(null);
  const stopMeetingRef = useRef<(() => void) | null>(null);
  const followUpSeedRef = useRef<FollowUpSeed | null>(null);
  const handleLiveSessionChange = useCallback(
    (session: { listening: boolean; loading: boolean }) => {
      setListening(session.listening);
      setStarting(session.loading);
    },
    [],
  );

  const navigate = useCallback((next: AppPage) => {
    if (next !== "settings") {
      lastMainPageRef.current = next;
    }
    setPage(next);
  }, []);

  const startMeeting = useCallback(() => {
    navigate("transcribe");
    if (listening || starting) return;
    startMeetingRef.current?.();
  }, [listening, starting, navigate]);

  return (
    <AppLayout
      currentPage={page}
      onNavigate={navigate}
      listening={listening}
      loading={starting}
      onStartMeeting={startMeeting}
      onStopMeeting={() => {
        stopMeetingRef.current?.();
      }}
    >
      {page === "home" ? <HomePage /> : null}
      <Activity mode={page === "transcribe" ? "visible" : "hidden"}>
        <TranscribePage
          startMeetingRef={startMeetingRef}
          stopMeetingRef={stopMeetingRef}
          followUpSeedRef={followUpSeedRef}
          onLiveSessionChange={handleLiveSessionChange}
          onMeetingFinished={({ meetingId, skipAutoSummary }) => {
            setListening(false);
            setStarting(false);
            setArrivedMeetingId(meetingId);
            setSkipAutoSummaryNotice(skipAutoSummary);
            navigate("meetings");
          }}
        />
      </Activity>
      {page === "meetings" ? (
        <MeetingsPage
          arrivedMeetingId={arrivedMeetingId}
          skipAutoSummaryNotice={skipAutoSummaryNotice}
          meetingInProgress={listening || starting}
          onDismissSkipAutoSummaryNotice={() => setSkipAutoSummaryNotice(false)}
          onFollowUpMeeting={(seed) => {
            followUpSeedRef.current = seed;
            startMeeting();
          }}
        />
      ) : null}
      {page === "settings" ? (
        <SettingsPage onBack={() => navigate(lastMainPageRef.current)} />
      ) : null}
      <OnboardingProvider />
    </AppLayout>
  );
}

export default App;
