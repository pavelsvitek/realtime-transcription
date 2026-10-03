"use client";

import Image from "next/image";
import { useState } from "react";
import { AmieWindow } from "./amie-window";
import { TeamsMark, ZoomMark } from "./works-with-icons";
import { cn } from "@/lib/utils";

type CallApp = "zoom" | "teams";

const WINDOW =
  "h-[min(360px,48vh)] min-h-[280px] w-full min-w-0";

export function SpeakerStory({
  appearance,
}: {
  appearance: "light" | "dark";
}) {
  const [app, setApp] = useState<CallApp>("zoom");
  const dark = appearance === "dark";

  return (
    <article className="grid items-start gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <h2 className="amie-display text-[clamp(1.7rem,3vw,2.35rem)]">
          The name on the tile is the name in the notes
        </h2>
        <p className="mt-3 max-w-md text-[16px] leading-7 text-[color:var(--amie-muted)]">
          Allow Accessibility. Amie reads the active speaker from Zoom or
          Microsoft Teams. No bot in the waiting room.
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-stretch">
        <CallGallery app={app} onApp={setApp} />
        <CarryDown label={app === "zoom" ? "from the Zoom tile" : "from the Teams tile"} />
        <AmieWindow
          scene="speakers"
          chrome="content"
          namedSpeakers
          accentSpeaker="Alex Chen"
          appearance={appearance}
          className={cn(
            WINDOW,
            dark
              ? "shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              : "shadow-[0_16px_40px_rgba(15,23,42,0.10)]",
          )}
        />
      </div>
    </article>
  );
}

function CallGallery({
  app,
  onApp,
}: {
  app: CallApp;
  onApp: (app: CallApp) => void;
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
        <div className="flex rounded-md bg-white/8 p-0.5">
          <AppToggle current={app} id="zoom" onApp={onApp}>
            Zoom
          </AppToggle>
          <AppToggle current={app} id="teams" onApp={onApp}>
            Teams
          </AppToggle>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
        <Tile src={src} side="left" name="You" />
        <Tile src={src} side="right" name="Alex Chen" speaking ring={zoom ? "zoom" : "teams"} />
      </div>
      <figcaption className="sr-only">
        Illustrated {zoom ? "Zoom" : "Teams"} call. Alex Chen is the active
        speaker.
      </figcaption>
      <p className="px-3 pb-3 text-center text-[11px] text-[#a1a1aa]">
        Two people. No notetaker on the call.
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
}: {
  src: string;
  side: "left" | "right";
  name: string;
  speaking?: boolean;
  ring?: "zoom" | "teams";
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
          "absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
          speaking ? "bg-black/70 text-white" : "bg-black/55 text-[#e4e4e7]",
        )}
      >
        {name}
      </span>
    </div>
  );
}

function CarryDown({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 text-amie">
      <svg viewBox="0 0 20 36" className="h-9 w-5" fill="none" aria-hidden="true">
        <path
          className="amie-carry-line"
          d="M10 2v24"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M5 22l5 8 5-8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <p className="text-center text-[12px] font-medium">{label}</p>
    </div>
  );
}
