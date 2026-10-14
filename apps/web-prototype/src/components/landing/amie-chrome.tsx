import type { ReactNode } from "react";
import Image from "next/image";

export type AmieNavId = "home" | "transcription" | "meetings" | "settings";

export function AmieWindowFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[680px] w-[1040px] overflow-hidden rounded-lg bg-dark-surface-shell shadow-[0_0_0_1px_#FFFFFF29,0_40px_120px_#000000B3]">
      {children}
    </div>
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

function MicIcon() {
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
      className="shrink-0 text-primary-foreground"
      aria-hidden
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function LiveMeetingButton({ listening }: { listening: boolean }) {
  return (
    <div
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-primary-foreground shadow-[0_0_0_1px_#FBAD7D40,0_8px_28px_#E2788873]"
      style={{
        backgroundImage:
          "linear-gradient(in oklab 120deg, var(--color-peach) 0%, var(--color-coral) 45%, var(--color-primary) 100%)",
      }}
    >
      {listening ? <ListeningBars /> : <MicIcon />}
      <span className="text-sm leading-4 font-semibold">
        {listening ? "Listening .." : "Start a meeting"}
      </span>
    </div>
  );
}

export function AmieSidebar({
  active,
  listening = false,
}: {
  active: AmieNavId;
  listening?: boolean;
}) {
  return (
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
        <LiveMeetingButton listening={listening} />
        <div className="h-1 w-full shrink-0" />
        <SidebarItem
          label="Home"
          active={active === "home"}
          icon={
            <>
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V20h14V9.5" />
            </>
          }
        />
        <SidebarItem
          label="Transcription"
          active={active === "transcription"}
          icon={
            <>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </>
          }
        />
        <SidebarItem
          label="Meetings"
          active={active === "meetings"}
          icon={
            <>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" x2="16" y1="2" y2="6" />
              <line x1="8" x2="8" y1="2" y2="6" />
              <line x1="3" x2="21" y1="10" y2="10" />
            </>
          }
        />
        <SidebarItem
          label="Settings"
          active={active === "settings"}
          icon={
            <>
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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
  );
}
