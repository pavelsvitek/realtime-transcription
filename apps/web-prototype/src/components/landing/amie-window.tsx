import type { ReactNode } from "react";
import Image from "next/image";

function ListeningBars() {
  const bars = [
    { x: 1.725, h: 4.6, y: 5.7, delay: "0ms" },
    { x: 3.575, h: 6.8, y: 4.6, delay: "80ms" },
    { x: 5.425, h: 10.4, y: 2.8, delay: "160ms" },
    { x: 7.275, h: 7.2, y: 4.4, delay: "40ms" },
    { x: 9.125, h: 13.2, y: 1.4, delay: "200ms" },
    { x: 10.975, h: 9.8, y: 3.1, delay: "120ms" },
    { x: 12.825, h: 15, y: 0.5, delay: "0ms" },
    { x: 14.675, h: 8.4, y: 3.8, delay: "240ms" },
    { x: 16.525, h: 11.6, y: 2.2, delay: "90ms" },
    { x: 18.375, h: 6.4, y: 4.8, delay: "180ms" },
    { x: 20.225, h: 5, y: 5.5, delay: "60ms" },
  ];

  return (
    <svg width="22" height="16" viewBox="0 0 26 16" aria-hidden>
      {bars.map((bar) => (
        <rect
          key={bar.x}
          className="listen-bar"
          x={bar.x}
          y={bar.y}
          width="1.3"
          height={bar.h}
          rx="0.65"
          fill="#FFFFFF"
          style={{ animationDelay: bar.delay }}
        />
      ))}
    </svg>
  );
}

function NavIcon({
  children,
  active,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={active ? "text-dark-text-active" : "text-dark-text-secondary"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const LINES = [
  {
    time: "0:02",
    speaker: "You",
    you: true,
    text: "Yeah I can take notes on this.",
  },
  {
    time: "0:08",
    speaker: "Alex",
    you: false,
    text: "Great. So for the Q3 roadmap, what are we shipping first?",
  },
  {
    time: "0:15",
    speaker: "You",
    you: true,
    text: "We should prioritize the offline path — local ASR before cloud fallback.",
  },
  {
    time: "0:22",
    speaker: "Alex",
    you: false,
    text: "Agreed. And keep speaker tags in the export so summaries stay readable.",
  },
  {
    time: "0:31",
    speaker: "Alex",
    you: false,
    text: "Quick question — is this getting uploaded somewhere?",
  },
];

export function AmieWindow() {
  return (
    <div className="flex h-[680px] w-[1040px] overflow-hidden rounded-lg bg-dark-surface-shell shadow-[0_0_0_1px_#FFFFFF29,0_40px_120px_#000000B3]">
      <aside className="flex h-full w-[240px] shrink-0 flex-col bg-dark-surface-chrome px-3 pb-4">
        <div className="flex h-12 shrink-0 items-center gap-2 px-1">
          <span className="size-3 shrink-0 rounded-full bg-[#FF5F57]" />
          <span className="size-3 shrink-0 rounded-full bg-[#FEBC2E]" />
          <span className="size-3 shrink-0 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex items-center gap-2.5 px-1 pt-1 pb-3.5">
          <Image
            src="/amie-icon.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-md shadow-[0_1px_2px_#0F172A1F]"
          />
          <span className="text-md leading-[18px] font-bold tracking-tight text-dark-text-primary">
            Amie
          </span>
        </div>
        <div className="flex min-h-0 grow flex-col gap-1">
          <div
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-primary-foreground shadow-[0_0_0_1px_#FBAD7D40,0_8px_28px_#E2788873]"
            style={{
              backgroundImage:
                "linear-gradient(in oklab 120deg, var(--color-peach) 0%, var(--color-coral) 45%, var(--color-primary) 100%)",
            }}
          >
            <ListeningBars />
            <span className="text-sm leading-4 font-semibold">Listening ..</span>
          </div>
          <div className="h-1 w-full shrink-0" />
          <SidebarItem
            label="Home"
            icon={
              <>
                <path
                  d="M3 10.5 12 3l9 7.5"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 9.5V20h14V9.5"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            }
          />
          <SidebarItem
            label="Transcription"
            active
            icon={
              <>
                <path
                  d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19 10v2a7 7 0 0 1-14 0v-2"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="12"
                  x2="12"
                  y1="19"
                  y2="22"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </>
            }
          />
          <SidebarItem
            label="Meetings"
            icon={
              <>
                <rect
                  x="3"
                  y="4"
                  width="18"
                  height="18"
                  rx="2"
                  fill="none"
                  strokeWidth="2"
                />
                <line x1="16" x2="16" y1="2" y2="6" strokeWidth="2" />
                <line x1="8" x2="8" y1="2" y2="6" strokeWidth="2" />
                <line x1="3" x2="21" y1="10" y2="10" strokeWidth="2" />
              </>
            }
          />
          <SidebarItem
            label="Settings"
            icon={
              <>
                <circle cx="12" cy="12" r="3" fill="none" strokeWidth="2" />
                <path
                  d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                  fill="none"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </>
            }
          />
        </div>
        <div className="flex w-full shrink-0 items-center gap-2 rounded-sm px-2.5 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <rect
              x="2"
              y="3"
              width="20"
              height="14"
              rx="2"
              fill="none"
              stroke="var(--color-dark-text-secondary)"
              strokeWidth="2"
            />
            <line
              x1="8"
              x2="16"
              y1="21"
              y2="21"
              stroke="var(--color-dark-text-secondary)"
              strokeWidth="2"
            />
            <line
              x1="12"
              x2="12"
              y1="17"
              y2="21"
              stroke="var(--color-dark-text-secondary)"
              strokeWidth="2"
            />
          </svg>
          <span className="text-xs leading-4 font-medium text-dark-text-secondary">
            System
          </span>
        </div>
      </aside>

      <div className="flex h-full min-w-0 grow flex-col overflow-hidden bg-dark-surface-chrome">
        <div className="h-12 w-full shrink-0" />
        <div className="flex min-h-0 grow flex-col overflow-hidden rounded-tl-[12px] bg-dark-surface-content">
          <div className="flex w-full shrink-0 items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs leading-4 text-dark-text-primary">
                New chat
              </span>
              <span className="rounded-lg bg-dark-surface-muted px-2 py-0.5 text-[11px] leading-[14px] text-dark-text-muted">
                nemotron-speech-streaming-en-0.6b
              </span>
            </div>
            <div className="flex items-center gap-2">
              <SelectChip label="ASR" value="Local (Nemotron)" />
              <SelectChip label="Input" value="Mic + system" />
              <span className="flex items-center p-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19 10v2a7 7 0 0 1-14 0v-2"
                    fill="none"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="12"
                    x2="12"
                    y1="19"
                    y2="22"
                    stroke="#EF4444"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <span className="flex items-center justify-center rounded-sm bg-[#EF4444] px-4 py-1.5 text-sm leading-4 font-medium text-white">
                Stop
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 px-4">
            <div className="flex w-full gap-5 border-b border-dark-border">
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Summary
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] text-dark-text-muted">
                Context
              </span>
              <span className="pt-2 pb-2.5 text-base leading-[18px] font-semibold text-dark-text-primary shadow-[inset_0_-2px_0_var(--color-dark-primary)]">
                Transcript (live)
              </span>
            </div>
          </div>

          <div className="flex min-h-0 w-full grow flex-col gap-2 overflow-hidden p-4">
            {LINES.map((line) => (
              <div key={line.time + line.text} className="flex w-full items-baseline gap-2">
                <span className="w-9 shrink-0 text-xs leading-4 text-dark-text-muted tabular-nums">
                  {line.time}
                </span>
                <span
                  className={`w-14 shrink-0 text-sm leading-4 font-semibold ${
                    line.you
                      ? "text-dark-speaker-user"
                      : "text-dark-speaker-remote"
                  }`}
                >
                  {line.speaker}
                </span>
                <span className="text-base leading-[160%] text-dark-text-primary">
                  {line.text}
                </span>
              </div>
            ))}
            <div className="flex w-full items-baseline gap-2">
              <span className="w-9 shrink-0 text-xs leading-4 text-dark-text-muted tabular-nums">
                0:38
              </span>
              <span className="w-14 shrink-0 text-sm leading-4 font-semibold text-dark-speaker-user">
                You
              </span>
              <span className="flex items-center gap-0.5 text-base leading-[160%] text-dark-text-muted">
                Sure, median was around two hundr
                <span className="caret-blink ml-px inline-block h-3.5 w-0.5 shrink-0 bg-dark-text-muted" />
              </span>
            </div>
          </div>

          <div className="flex w-full shrink-0 items-center border-t border-dark-border px-4 py-2">
            <span className="text-xs leading-4 text-dark-text-muted">
              Capturing mic + system audio...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  icon,
  active,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <div className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2">
      <NavIcon active={active}>{icon}</NavIcon>
      <span
        className={`text-sm leading-4 font-medium ${
          active ? "text-dark-text-active" : "text-dark-text-secondary"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function SelectChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs leading-4 text-dark-text-secondary">{label}</span>
      <span className="flex items-center gap-1.5 rounded-sm border border-dark-border-input bg-dark-surface-input px-2 py-[5px]">
        <span className="text-xs leading-4 text-dark-text-primary">{value}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path
            d="M2 3.5L5 6.5L8 3.5"
            fill="none"
            stroke="var(--color-dark-text-muted)"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
