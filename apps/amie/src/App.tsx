import { Activity, useCallback, useEffect, useRef, useState } from "react";
import { AppLayout } from "./components/AppLayout";
import type { AppPage } from "./components/Sidebar";
import { UpdateProvider } from "./components/UpdateProvider";
import { SetupWizard } from "./components/setup/SetupWizard";
import { useSetupWizardOnLaunch } from "./hooks/useSetupWizardOnLaunch";
import { useSpeechModelDownload } from "./hooks/useSpeechModelDownload";
import { HomePage } from "./pages/HomePage";
import { MeetingsPage } from "./pages/MeetingsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TranscribePage } from "./pages/TranscribePage";
import type { FollowUpSeed } from "./lib/meetings";
import { markOnboardingSeen } from "./lib/onboarding";
import type { WizardStep } from "./lib/setup-wizard";
import { trackEvent } from "./lib/telemetry";

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
  // Returning users who only need the updated speech model jump straight to the
  // model step and then back to the summary/Home.
  const wizardLaunch = useSetupWizardOnLaunch();
  const speechModel = useSpeechModelDownload();
  const [wizardStep, setWizardStep] = useState<WizardStep>("welcome");
  const [wizardDone, setWizardDone] = useState(false);
  const [wizardReopened, setWizardReopened] = useState(false);
  const initializedLaunchStepRef = useRef(false);
  useEffect(() => {
    if (!wizardLaunch || initializedLaunchStepRef.current) return;
    initializedLaunchStepRef.current = true;
    if (wizardLaunch.modelUpgradeOnly) {
      setWizardStep("model");
    }
  }, [wizardLaunch]);
  const modelUpgradeOnly = Boolean(wizardLaunch?.modelUpgradeOnly && !wizardReopened);
  const wizardActive = (wizardLaunch?.show === true || wizardReopened) && !wizardDone;
  const finishWizard = useCallback(() => {
    markOnboardingSeen();
    setWizardDone(true);
    setWizardReopened(false);
    trackEvent("onboarding_completed");
  }, []);
  const openSetupSummary = useCallback(() => {
    setWizardStep("ready");
    setWizardDone(false);
    setWizardReopened(true);
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
    setPage((prev) => {
      if (prev !== next) {
        trackEvent("page_viewed", { page: next });
      }
      return next;
    });
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
      // Start comes back on the wizard's last step once the speech model is ready.
      startDisabled={wizardActive && (wizardStep !== "ready" || !speechModel.ready)}
      onStartMeeting={() => {
        if (wizardActive) finishWizard();
        startMeeting();
      }}
      onStopMeeting={() => {
        stopMeetingRef.current?.();
      }}
    >
      {page === "home" && wizardLaunch !== null ? (
        wizardActive ? (
          <SetupWizard
            step={wizardStep}
            onStepChange={setWizardStep}
            modelUpgradeOnly={modelUpgradeOnly}
            onStartMeeting={() => {
              finishWizard();
              startMeeting();
            }}
            onExit={wizardReopened || modelUpgradeOnly ? finishWizard : undefined}
          />
        ) : (
          <HomePage
            onStartMeeting={startMeeting}
            meetingInProgress={listening || starting}
            onOpenSetup={openSetupSummary}
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
            trackEvent("feature_used", { feature: "follow_up_meeting" });
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
