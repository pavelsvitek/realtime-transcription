import { Activity, useCallback, useRef, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { UpdateProvider } from "./components/UpdateProvider";
import { SetupWizard } from "./components/setup/SetupWizard";
import { useSetupWizardOnLaunch } from "./hooks/useSetupWizardOnLaunch";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import type { FollowUpSeed } from "./lib/meetings";
import { markOnboardingSeen } from "./lib/onboarding";
import type { WizardStep } from "./lib/setup-wizard";

function App() {
  const [page, setPage] = useState<AppPage>("home");
  const lastMainPageRef = useRef<Exclude<AppPage, "settings">>("home");
  const [arrivedMeetingId, setArrivedMeetingId] = useState<string | null>(null);
  const [skipAutoSummaryNotice, setSkipAutoSummaryNotice] = useState(false);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const startMeetingRef = useRef<(() => void) | null>(null);
  const stopMeetingRef = useRef<(() => void) | null>(null);
  const followUpSeedRef = useRef<FollowUpSeed | null>(null);
  // First-run setup on Home: decided once at launch, ended by starting a meeting.
  const wizardOnLaunch = useSetupWizardOnLaunch();
  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");
  const [wizardDone, setWizardDone] = useState(false);
  const wizardActive = wizardOnLaunch === true && !wizardDone;
  const finishWizard = useCallback(() => {
    markOnboardingSeen();
    setWizardDone(true);
  }, []);
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
      // Start comes back on the wizard's last step, where it ends the wizard.
      startDisabled={wizardActive && wizardStep !== "ready"}
      onStartMeeting={() => {
        if (wizardActive) finishWizard();
        startMeeting();
      }}
      onStopMeeting={() => {
        stopMeetingRef.current?.();
      }}
    >
      {page === "home" && wizardOnLaunch !== null ? (
        wizardActive ? (
          <SetupWizard
            step={wizardStep}
            onStepChange={setWizardStep}
            onStartMeeting={() => {
              finishWizard();
              startMeeting();
            }}
          />
        ) : (
          <HomePage
            onStartMeeting={startMeeting}
            meetingInProgress={listening || starting}
          />
        )
      ) : null}
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
      <UpdateProvider meetingActive={listening || starting} />
    </AppLayout>
  );
}

export default App;
