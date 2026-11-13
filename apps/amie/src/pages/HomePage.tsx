import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSpeechModelDownload } from "../hooks/useSpeechModelDownload";

type HomePageProps = {
  onStartMeeting: () => void;
  meetingInProgress: boolean;
};

const WAVE_BARS: [number, number][] = [
  [25, 10], [21, 18], [15, 30], [20, 20], [9, 42], [16, 28], [2, 56], [13, 34],
  [6, 48], [18, 24], [23, 14], [17, 26], [10, 40], [19, 22], [24, 12],
];

const FLOW_STEPS = ["Start with ⌘N", "Live transcript", "Summary", "Follow-up meeting"];

/** Ready-to-record state of Home ("B · Calm hero — Stage 1" in Paper). */
export function HomePage({ onStartMeeting, meetingInProgress }: HomePageProps) {
  const model = useSpeechModelDownload();
  const micAllowed = useMicrophoneAllowed();
  const setUp = model.ready && micAllowed;

  return (
    <main className="home-page">
      {setUp ? (
        <p className="home-setup-badge">
          <span className="home-setup-check" aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 24 24">
              <path
                d="M20 6 9 17l-5-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          Everything is set up
        </p>
      ) : null}

      <div className="home-spacer" />

      <section className="home-hero" aria-labelledby="home-hero-title">
        <svg
          className="home-wave"
          width="105"
          height="60"
          viewBox="0 0 105 60"
          aria-hidden="true"
        >
          {WAVE_BARS.map(([y, h], i) => (
            <rect key={i} x={i * 7} y={y} width="4" height={h} rx="2" />
          ))}
        </svg>
        <h1 id="home-hero-title" className="home-title">
          Amie listens to your next call and keeps notes for you.
        </h1>
        <p className="home-subtitle">
          Live transcript while you talk. A clean summary when you hang up.
        </p>
        <button
          type="button"
          className="home-start"
          onClick={onStartMeeting}
          disabled={meetingInProgress}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          {meetingInProgress ? "Meeting in progress" : "Start a meeting"}
          {meetingInProgress ? null : <kbd className="home-kbd">⌘ N</kbd>}
        </button>
      </section>

      <div className="home-spacer" />

      <ol className="home-flow" aria-label="How Amie works">
        {FLOW_STEPS.map((step) => (
          <li key={step} className="home-flow-step">
            <span className="home-flow-dot" aria-hidden="true" />
            {step}
          </li>
        ))}
      </ol>
    </main>
  );
}

type SystemAccessStatus = { microphone: string };

function useMicrophoneAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    invoke<SystemAccessStatus>("get_system_access_status")
      .then((status) => {
        if (!cancelled) setAllowed(status.microphone === "authorized");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return allowed;
}
