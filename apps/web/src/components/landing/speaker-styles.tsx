"use client";

import Image from "next/image";
import { useState } from "react";
import { AmieWindow } from "./amie-window";
import { DEMO_NAMED_LINES } from "./copy";
import { ListeningEq } from "./mark";
import { TeamsMark, ZoomMark } from "./works-with-icons";
import { cn } from "@/lib/utils";

type CallApp = "zoom" | "teams";
type Appearance = { appearance: "light" | "dark" };

const WINDOW = "h-[min(360px,48vh)] min-h-[280px] w-full min-w-0";

function shade(dark: boolean) {
  return dark
    ? "shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
    : "shadow-[0_16px_40px_rgba(15,23,42,0.10)]";
}

function NotesWindow({
  appearance,
  accent = false,
  hint,
}: Appearance & { accent?: boolean; hint?: string }) {
  return (
    <AmieWindow
      scene="speakers"
      chrome="content"
      namedSpeakers
      accentSpeaker={accent ? "Alex Chen" : undefined}
      remoteSpeakerHint={hint}
      appearance={appearance}
      className={cn(WINDOW, shade(appearance === "dark"))}
    />
  );
}

function CallStage({
  app = "zoom",
  onApp,
  emptyBot = false,
  caption = false,
  loupe = false,
  wave = false,
  ring = true,
}: {
  app?: CallApp;
  onApp?: (app: CallApp) => void;
  emptyBot?: boolean;
  caption?: boolean;
  loupe?: boolean;
  wave?: boolean;
  ring?: boolean;
}) {
  const zoom = app === "zoom";
  const src = zoom
    ? "/landing/zoom-gallery-alex.jpg"
    : "/landing/teams-gallery-alex.jpg";

  return (
    <figure className="overflow-hidden rounded-[12px] bg-[#111113] text-[#f5f5f5] shadow-[0_20px_48px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between px-3 py-2.5">
        <p className="flex items-center gap-2 text-[12px] font-medium">
          {zoom ? (
            <ZoomMark className="h-3.5 w-3.5 text-[#2D8CFF]" />
          ) : (
            <TeamsMark className="h-4 w-4 text-[#7B83EB]" />
          )}
          {zoom ? "Zoom" : "Teams"}
          <span className="text-[#a1a1aa]">Hiring plan</span>
        </p>
        {onApp ? (
          <div className="flex rounded-md bg-white/8 p-0.5">
            <AppToggle current={app} id="zoom" onApp={onApp}>
              Zoom
            </AppToggle>
            <AppToggle current={app} id="teams" onApp={onApp}>
              Teams
            </AppToggle>
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
        <Tile src={src} side="left" name="You" />
        <Tile
          src={src}
          side="right"
          name="Alex Chen"
          speaking={ring}
          ring={zoom ? "zoom" : "teams"}
          caption={caption}
          loupe={loupe}
          wave={wave}
        />
      </div>
      <p className="px-3 pb-3 text-center text-[11px] text-[#a1a1aa]">
        {emptyBot ? "Participants: 2. No Amie. No notetaker." : "Two people. No notetaker on the call."}
      </p>
    </figure>
  );
}

function AppToggle({
  current,
  id,
  onApp,
  children,
}: {
  current: CallApp;
  id: CallApp;
  onApp: (app: CallApp) => void;
  children: string;
}) {
  const selected = current === id;
  return (
    <button
      type="button"
      onClick={() => onApp(id)}
      aria-pressed={selected}
      className={cn(
        "rounded-[6px] px-2 py-1 text-[11px] font-medium",
        selected ? "bg-white/14 text-white" : "text-[#a1a1aa] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Tile({
  src,
  side,
  name,
  speaking = false,
  ring,
  caption = false,
  loupe = false,
  wave = false,
}: {
  src: string;
  side: "left" | "right";
  name: string;
  speaking?: boolean;
  ring?: "zoom" | "teams";
  caption?: boolean;
  loupe?: boolean;
  wave?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-[5/4] overflow-hidden rounded-md bg-[#1c1c1e]",
        speaking && ring === "zoom" && "ring-2 ring-[#2D8CFF]",
        speaking && ring === "teams" && "ring-2 ring-[#7B83EB]",
      )}
    >
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width: 1024px) 280px, 45vw"
        className={cn(
          "object-cover",
          side === "left" ? "object-[22%_40%]" : "object-[78%_38%]",
        )}
      />
      <span
        className={cn(
          "absolute bottom-2 left-2 z-10 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
          speaking ? "bg-black/70 text-white" : "bg-black/55 text-[#e4e4e7]",
        )}
      >
        {name}
        {wave ? <ListeningEq className="ml-1.5 inline-block align-middle text-white" /> : null}
      </span>
      {caption ? (
        <p className="absolute inset-x-3 bottom-9 rounded-md bg-black/75 px-2 py-1 text-center text-[12px] font-medium">
          Alex Chen
        </p>
      ) : null}
      {loupe ? (
        <span
          aria-hidden
          className="amie-loupe pointer-events-none absolute bottom-1 left-1 size-16 rounded-full border-2 border-white/80"
        />
      ) : null}
    </div>
  );
}

function CarryDown({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 text-amie">
      <svg viewBox="0 0 20 36" className="h-9 w-5" fill="none" aria-hidden="true">
        <path className="amie-carry-line" d="M10 2v24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 22l5 8 5-8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="text-center text-[12px] font-medium">{label}</p>
    </div>
  );
}

function CarryRight({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2 text-amie">
      <svg viewBox="0 0 36 20" className="hidden h-5 w-9 lg:block" fill="none" aria-hidden="true">
        <path className="amie-carry-line" d="M2 10h24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M22 5l8 5-8 5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg viewBox="0 0 20 36" className="h-9 w-5 lg:hidden" fill="none" aria-hidden="true">
        <path className="amie-carry-line" d="M10 2v24" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 22l5 8 5-8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="text-center text-[12px] font-medium">{label}</p>
    </div>
  );
}

const HINT = "The name is taken from a call in MS Teams or other supported apps";

/** B1 — Amie only; the source is a hover. */
export function SpeakerStyleTooltip({ appearance }: Appearance) {
  return (
    <div className="mx-auto max-w-3xl">
      <NotesWindow appearance={appearance} hint={HINT} />
      <p className="mt-3 text-[13px] text-[color:var(--amie-muted)]">
        Hover or focus Alex Chen in the transcript.
      </p>
    </div>
  );
}

/** B2 — nameplate to transcript. */
export function SpeakerStyleNameplate({ appearance }: Appearance) {
  const [app, setApp] = useState<CallApp>("zoom");
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <CallStage app={app} onApp={setApp} />
      <CarryDown label={app === "zoom" ? "from the Zoom tile" : "from the Teams tile"} />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B3 — Zoom roster vs Amie speakers. */
export function SpeakerStyleRoster({ appearance }: Appearance) {
  return (
    <div data-appearance={appearance} className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-[12px] border border-[color:var(--amie-line)] bg-[#111113] p-4 text-[#f5f5f5]">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <ZoomMark className="h-3.5 w-3.5 text-[#2D8CFF]" />
          Participants
        </p>
        <ul className="mt-3 divide-y divide-white/10">
          <li className="flex items-center justify-between py-2.5 text-[14px]">
            You
            <span className="text-[12px] text-[#a1a1aa]">muted</span>
          </li>
          <li className="flex items-center justify-between py-2.5 text-[14px]">
            <span className="font-semibold">Alex Chen</span>
            <span className="text-[12px] text-[#2D8CFF]">speaking</span>
          </li>
        </ul>
      </div>
      <ul className="rounded-[12px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-4 py-2">
        {DEMO_NAMED_LINES.map((line) => (
          <li
            key={line.time + line.text}
            className="flex gap-3 border-b border-[color:var(--amie-line)] py-2.5 last:border-0"
          >
            <span className="w-10 shrink-0 tabular-nums text-[12px] text-[color:var(--amie-faint)]">
              {line.time}
            </span>
            <span
              className={cn(
                "min-w-24 font-semibold",
                line.speaker === "Alex Chen" && "amie-name-match text-amie-remote",
                line.speaker === "You" && "text-amie",
              )}
            >
              {line.speaker}
            </span>
            <span className="text-[14px] text-[color:var(--amie-ink)]">{line.text}</span>
          </li>
        ))}
      </ul>
      <p className="lg:col-span-2 text-[13px] text-[color:var(--amie-muted)]">
        Same two names. The roster is the source; the transcript is the sink.
      </p>
    </div>
  );
}

/** B4 — Accessibility on, then the tile, then Amie. */
export function SpeakerStyleAccess({ appearance }: Appearance) {
  return (
    <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,0.7fr)_auto_minmax(0,0.9fr)_auto_minmax(0,1.1fr)]">
      <div className="rounded-[12px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] p-4">
        <p className="text-[13px] text-[color:var(--amie-muted)]">System Settings</p>
        <p className="mt-2 text-[16px] font-medium">Accessibility</p>
        <p className="mt-3 flex items-center justify-between rounded-md bg-amie/12 px-3 py-2 text-[13px]">
          Amie
          <span className="font-semibold text-amie">On</span>
        </p>
      </div>
      <CarryRight label="reads" />
      <CallStage />
      <CarryRight label="labels" />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B5 — the call has no bot; the notes still have names. */
export function SpeakerStyleEmpty({ appearance }: Appearance) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <CallStage emptyBot />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B6 — a live caption on the tile, then the same words in Amie. */
export function SpeakerStyleCaption({ appearance }: Appearance) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <CallStage caption />
      <CarryDown label="caption becomes a speaker line" />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B7 — a loupe on the Zoom nameplate. */
export function SpeakerStyleLoupe({ appearance }: Appearance) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <CallStage loupe />
      <CarryDown label="reads the pixels on this Mac" />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B8 — the same ring on the tile and on the name. */
export function SpeakerStyleSpotlight({ appearance }: Appearance) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <CallStage />
      <CarryDown label="same person" />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B9 — waveform on the speaking tile. */
export function SpeakerStyleWave({ appearance }: Appearance) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <CallStage wave />
      <CarryDown label="not diarization — the nameplate" />
      <NotesWindow appearance={appearance} accent />
    </div>
  );
}

/** B10 — the lecture is always on, not hidden in a hover. */
export function SpeakerStyleLecture({ appearance }: Appearance) {
  return (
    <div className="mx-auto max-w-3xl">
      <NotesWindow appearance={appearance} accent hint={HINT} />
      <aside className="mt-4 rounded-[12px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-4 py-3 text-[14px] leading-6 text-[color:var(--amie-ink)]">
        <span className="font-semibold text-amie-remote">Alex Chen</span> is
        copied from the Zoom or Teams tile. Amie never joins the call. Allow
        Accessibility, then the nameplate is the name in the notes.
      </aside>
    </div>
  );
}

export const SPEAKER_STYLES = [
  { id: "tooltip", name: "Amie only, hover the name", Style: SpeakerStyleTooltip },
  { id: "nameplate", name: "Nameplate to transcript", Style: SpeakerStyleNameplate },
  { id: "roster", name: "Split roster", Style: SpeakerStyleRoster },
  { id: "access", name: "Accessibility beam", Style: SpeakerStyleAccess },
  { id: "empty", name: "Empty call, named notes", Style: SpeakerStyleEmpty },
  { id: "caption", name: "Live caption bar", Style: SpeakerStyleCaption },
  { id: "loupe", name: "Loupe on the nameplate", Style: SpeakerStyleLoupe },
  { id: "spotlight", name: "Spotlight rhyme", Style: SpeakerStyleSpotlight },
  { id: "wave", name: "Waveform and nameplate", Style: SpeakerStyleWave },
  { id: "lecture", name: "Hover lecture, always on", Style: SpeakerStyleLecture },
] as const;
