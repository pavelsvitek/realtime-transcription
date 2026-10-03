"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  DEMO_CONTEXT,
  DEMO_LINES,
  DEMO_MEETINGS,
  DEMO_SUMMARY,
  STORE_PATH,
} from "./copy";
import { ListeningEq } from "./mark";
import { MacTrafficLights } from "./chrome";
import { cn } from "@/lib/utils";

export type AppPage = "home" | "transcribe" | "meetings" | "settings";
export type MeetingTab = "transcript" | "summary" | "context";
export type WindowScene = "idle" | "live" | "finished" | "files" | "privacy";

type AmieWindowProps = {
  scene?: WindowScene;
  appearance?: "light" | "dark";
  poster?: boolean;
  className?: string;
  autoPlay?: boolean;
  onListeningChange?: (listening: boolean) => void;
};

const NAV: { id: AppPage; label: string; icon: ReactNode }[] = [
  { id: "home", label: "Home", icon: <HomeIcon /> },
  { id: "transcribe", label: "Transcription", icon: <MicIcon /> },
  { id: "meetings", label: "Meetings", icon: <CalIcon /> },
  { id: "settings", label: "Settings", icon: <GearIcon /> },
];

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AmieWindow({
  scene = "idle",
  appearance = "light",
  poster = false,
  className,
  autoPlay = false,
  onListeningChange,
}: AmieWindowProps) {
  const initial = initialState(scene);
  const [page, setPage] = useState<AppPage>(initial.page);
  const [tab, setTab] = useState<MeetingTab>(initial.tab);
  const [listening, setListening] = useState(initial.listening);
  const [visible, setVisible] = useState(initial.visible);
  const [backend, setBackend] = useState<"local" | "xai">("local");

  const start = useCallback(() => {
    setPage("transcribe");
    setTab("transcript");
    setListening(true);
    setVisible(prefersReducedMotion() ? DEMO_LINES.length : 0);
    onListeningChange?.(true);
  }, [onListeningChange]);

  const stop = useCallback(() => {
    setListening(false);
    setVisible(DEMO_LINES.length);
    onListeningChange?.(false);
  }, [onListeningChange]);

  useEffect(() => {
    if (!autoPlay || scene === "finished" || scene === "files" || scene === "privacy") {
      return;
    }
    const id = window.setTimeout(start, 400);
    return () => window.clearTimeout(id);
  }, [autoPlay, scene, start]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      if (listening) return;
      start();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening, start]);

  useEffect(() => {
    if (!listening) return;
    if (visible >= DEMO_LINES.length) return;
    const id = window.setTimeout(
      () => setVisible((n) => Math.min(DEMO_LINES.length, n + 1)),
      900,
    );
    return () => window.clearTimeout(id);
  }, [listening, visible]);

  const dark = appearance === "dark";

  return (
    <div
      className={cn(
        "flex h-[min(620px,72vh)] min-h-[420px] overflow-hidden rounded-[12px] border shadow-[0_24px_80px_rgba(15,23,42,0.18)]",
        poster && "amie-window-poster",
        dark
          ? "border-white/10 bg-[color:var(--amie-shell)]"
          : "border-[#d8d8d8] bg-[color:var(--amie-shell)]",
        className,
      )}
    >
      <aside
        className={cn(
          "flex w-[200px] shrink-0 flex-col px-3 pb-3 max-[720px]:hidden",
          dark ? "bg-[#1a1a1c]" : "bg-[#f5f5f5]",
        )}
      >
        <div className="flex h-12 items-center px-1">
          <MacTrafficLights />
        </div>
        <div className="mb-3 flex items-center gap-2.5 px-1">
          <Image
            src="/landing/amie-icon.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-[7px] shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
          />
          <span className="text-[15px] font-semibold tracking-[-0.02em]">
            Amie
          </span>
        </div>
        <button
          type="button"
          className={cn(
            "mb-2 flex w-full items-center gap-2 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold text-white",
            listening
              ? "bg-amie"
              : "bg-amie hover:bg-amie-hover",
          )}
          onClick={listening ? stop : start}
        >
          {listening ? <ListeningEq /> : <MicIcon className="text-white" />}
          {listening ? "Listening .." : "Start a meeting"}
        </button>
        <ul className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium",
                  page === item.id
                    ? "text-[color:var(--amie-ink)]"
                    : "text-[color:var(--amie-muted)] hover:bg-[color:var(--amie-hover)] hover:text-[color:var(--amie-ink)]",
                )}
                onClick={() => setPage(item.id)}
                aria-current={page === item.id ? "page" : undefined}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <p className="px-2.5 text-[12px] text-[color:var(--amie-muted)]">
          System
        </p>
      </aside>

      <section
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-[12px]",
          dark ? "bg-[#111113]" : "bg-white",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 px-4 max-[720px]:pl-4">
          <div className="hidden max-[720px]:block">
            <MacTrafficLights />
          </div>
          <p className="text-[13px] font-medium">
            {page === "home" && "Home"}
            {page === "transcribe" && (listening ? "Live meeting" : "New chat")}
            {page === "meetings" && "Meetings"}
            {page === "settings" && "Settings"}
          </p>
          {page === "transcribe" ? (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                className="rounded-[10px] bg-amie px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-amie-hover"
                onClick={listening ? stop : start}
              >
                {listening ? "Stop" : "Start a meeting"}
              </button>
            </div>
          ) : (
            <div className="ml-auto hidden text-[12px] text-[color:var(--amie-muted)] sm:block">
              ⌘N start
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          {page === "home" && (
            <HomePane onStart={start} />
          )}
          {page === "transcribe" && (
            <TranscribePane
              tab={tab}
              onTab={setTab}
              visible={visible}
              listening={listening}
            />
          )}
          {page === "meetings" && <MeetingsPane />}
          {page === "settings" && (
            <SettingsPane backend={backend} onBackend={setBackend} />
          )}
        </div>
      </section>
    </div>
  );
}

function initialState(scene: WindowScene) {
  switch (scene) {
    case "live":
      return { page: "transcribe" as const, tab: "transcript" as const, listening: true, visible: 1 };
    case "finished":
      return { page: "transcribe" as const, tab: "summary" as const, listening: false, visible: DEMO_LINES.length };
    case "files":
      return { page: "meetings" as const, tab: "transcript" as const, listening: false, visible: DEMO_LINES.length };
    case "privacy":
      return { page: "settings" as const, tab: "transcript" as const, listening: false, visible: DEMO_LINES.length };
    default:
      return { page: "transcribe" as const, tab: "transcript" as const, listening: false, visible: 0 };
  }
}

function HomePane({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <p className="amie-display text-[2rem]">Start a meeting with ⌘N</p>
      <p className="max-w-sm text-[14px] leading-6 text-[color:var(--amie-muted)]">
        Amie listens to you and the room. Nothing joins the call. Transcript stays on this Mac.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="rounded-[10px] bg-amie px-4 py-2 text-[13px] font-semibold text-white hover:bg-amie-hover"
      >
        Start a meeting
      </button>
    </div>
  );
}

function TranscribePane({
  tab,
  onTab,
  visible,
  listening,
}: {
  tab: MeetingTab;
  onTab: (tab: MeetingTab) => void;
  visible: number;
  listening: boolean;
}) {
  const lines = DEMO_LINES.slice(0, visible);
  const tabs: { id: MeetingTab; label: string }[] = [
    { id: "summary", label: "Summary" },
    { id: "context", label: "Context" },
    { id: "transcript", label: listening ? "Transcript (live)" : "Transcript" },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-5 border-b border-[color:var(--amie-line)] px-6">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            className={cn(
              "border-b-2 py-2.5 text-[13px]",
              tab === item.id
                ? "border-amie font-semibold text-[color:var(--amie-ink)]"
                : "border-transparent text-[color:var(--amie-faint)]",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-6 py-5">
        {tab === "transcript" && (
          <div>
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-16 text-center text-[color:var(--amie-muted)]">
                <p className="text-[14px]">
                  {listening ? "Listening…" : "Press Start to begin transcribing..."}
                </p>
                <p className="text-[13px]">
                  We will use Internal MacBook microphone to record.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {lines.map((line, index) => {
                  const last = index === lines.length - 1 && listening;
                  return (
                    <li key={line.time + line.text} className="flex gap-2 text-[13px] leading-6">
                      <span className="w-10 shrink-0 tabular-nums text-[color:var(--amie-faint)]">
                        {line.time}
                      </span>
                      <span
                        className={cn(
                          "w-14 shrink-0 font-semibold",
                          line.speaker === "User" ? "text-amie" : "text-amie-remote",
                        )}
                      >
                        {line.speaker}
                      </span>
                      <span>
                        {line.text}
                        {last ? <span className="amie-cursor" /> : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
        {tab === "summary" && (
          <div className="max-w-xl">
            {visible < DEMO_LINES.length && listening ? (
              <p className="text-[14px] text-[color:var(--amie-muted)]">
                Summary writes after you stop. Same meeting, same disk.
              </p>
            ) : (
              <p className="text-[15px] leading-7">{DEMO_SUMMARY}</p>
            )}
          </div>
        )}
        {tab === "context" && (
          <label className="block max-w-xl text-[12px] text-[color:var(--amie-muted)]">
            Context for this meeting
            <textarea
              readOnly
              value={DEMO_CONTEXT}
              className="mt-2 block h-40 w-full resize-none rounded-md border border-[color:var(--amie-line)] bg-transparent p-3 text-[13px] leading-5 text-[color:var(--amie-ink)]"
            />
          </label>
        )}
      </div>
    </div>
  );
}

function MeetingsPane() {
  return (
    <ul className="divide-y divide-[color:var(--amie-line)]">
      {DEMO_MEETINGS.map((meeting) => (
        <li key={meeting.title} className="flex items-baseline gap-4 px-6 py-4">
          <span className="w-20 text-[12px] text-[color:var(--amie-muted)]">
            {meeting.when}
          </span>
          <span className="flex-1 text-[15px] font-medium">{meeting.title}</span>
          <span className="text-[12px] tabular-nums text-[color:var(--amie-faint)]">
            {meeting.duration}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SettingsPane({
  backend,
  onBackend,
}: {
  backend: "local" | "xai";
  onBackend: (value: "local" | "xai") => void;
}) {
  return (
    <div className="flex max-w-lg flex-col gap-6 px-6 py-5 text-[14px]">
      <div>
        <p className="text-[12px] font-semibold tracking-[0.12em] text-amie uppercase">
          Store
        </p>
        <p className="mt-1 text-[color:var(--amie-muted)]">
          Meetings live in SQLite on this Mac. Capture does not require the cloud.
        </p>
        <code className="mt-2 block overflow-x-auto rounded-md bg-[color:var(--amie-shell)] px-3 py-2 font-mono text-[12px]">
          {STORE_PATH}
        </code>
      </div>
      <div>
        <p className="text-[12px] font-semibold tracking-[0.12em] text-amie uppercase">
          Transcription
        </p>
        <p className="mt-1 text-[color:var(--amie-muted)]">
          Local Nemotron is the default. xAI is the same pipeline with your key.
        </p>
        <div className="mt-2 flex gap-2">
          {(["local", "xai"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onBackend(id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[13px]",
                backend === id
                  ? "border-amie text-amie"
                  : "border-[color:var(--amie-line)] text-[color:var(--amie-muted)]",
              )}
            >
              {id === "local" ? "Local (Nemotron)" : "xAI"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[12px] font-semibold tracking-[0.12em] text-amie uppercase">
          Summaries
        </p>
        <p className="mt-1 text-[color:var(--amie-muted)]">
          Optional. xAI / OpenAI / Gemini when you add a key. No key, no upload.
        </p>
      </div>
    </div>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function CalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
