import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeroWave } from "../components/HeroWave";
import { useSpeechModelDownload } from "../hooks/useSpeechModelDownload";

type HomePageProps = {
  onStartMeeting: () => void;
  meetingInProgress: boolean;
};

const FLOW_STEPS = ["Start with ⌘N", "Live transcript", "Summary", "Follow-up meeting"];

/** Ready-to-record state of Home ("B · Calm hero — Stage 1" in Paper). */
export function HomePage({ onStartMeeting, meetingInProgress }: HomePageProps) {
  const model = useSpeechModelDownload();
  const micAllowed = useMicrophoneAllowed();
  const setUp = model.ready && micAllowed;

  return (
    <main className="relative flex flex-1 flex-col items-center overflow-y-auto px-10">
      {setUp ? (
        <p className="absolute top-[22px] right-7 flex items-center gap-1.5 text-[12.5px] leading-[18px] font-medium text-text-secondary">
          <span
            className="flex size-4 items-center justify-center rounded-full bg-brand-primary text-brand-on-primary"
            aria-hidden="true"
          >
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

      <div className="flex-[1_0_24px]" />

      <section
        className="flex flex-col items-center text-center"
        aria-labelledby="home-hero-title"
      >
        <HeroWave />
        <h1
          id="home-hero-title"
          className="mt-7 max-w-[720px] text-[46px] leading-[52px] font-[650] tracking-[-0.03em] text-text-primary"
        >
          Amie listens to your next call and keeps notes for you.
        </h1>
        <p className="mt-3.5 text-[16px] leading-[23px] text-text-secondary">
          Live transcript while you talk. A clean summary when you hang up.
        </p>
        <button
          type="button"
          className="mt-[30px] flex h-[54px] cursor-pointer items-center gap-2.5 rounded-xl border-none bg-brand-primary px-[26px] font-[family-name:inherit] text-[16px] leading-[23px] font-[650] text-brand-on-primary focus-visible:shadow-[0_0_0_3px_var(--brand-primary-ring)] focus-visible:outline-none enabled:hover:bg-brand-primary-hover disabled:cursor-default disabled:opacity-60"
          onClick={onStartMeeting}
          disabled={meetingInProgress}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
          {meetingInProgress ? "Meeting in progress" : "Start a meeting"}
          {meetingInProgress ? null : <kbd className="flex h-[22px] min-w-[22px] items-center justify-center rounded-[5px] border border-white/18 bg-white/14 px-1.5 font-[family-name:inherit] text-[12px] leading-4 font-medium text-[#dde9f2]">
              ⌘ N
            </kbd>}
        </button>
      </section>

      <div className="flex-[1_0_24px]" />

      <ol
        className="flex list-none flex-wrap items-center justify-center gap-3.5 pb-[30px]"
        aria-label="How Amie works"
      >
        {FLOW_STEPS.map((step) => (
          <li
            key={step}
            className="flex items-center gap-2 text-[13px] leading-[19px] font-medium text-text-secondary not-first:before:mr-1.5 not-first:before:h-px not-first:before:w-9 not-first:before:bg-border-input"
          >
            <span
              className="size-1.5 rounded-full bg-brand-speaker-user"
              aria-hidden="true"
            />
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
