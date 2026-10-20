import type { ReactNode } from "react";
import { SPEAKERS } from "@/data/roadmap-cut";

const TILES = [
  {
    speaker: "sam" as const,
    src: "/landing/sam.png",
    speaking: false,
    muted: false,
  },
  {
    speaker: "maya" as const,
    src: "/landing/maya.png",
    speaking: true,
    muted: false,
  },
  {
    speaker: "jordan" as const,
    src: "/landing/jordan.png",
    speaking: false,
    muted: true,
  },
  {
    speaker: "me" as const,
    src: "/landing/me.png",
    speaking: false,
    muted: false,
  },
] as const;

const CROP = [
  {
    time: "0:15",
    speaker: "sam" as const,
    text: "Local capture first. Cloud fallback can wait.",
    live: false,
  },
  {
    time: "0:22",
    speaker: "jordan" as const,
    text: "Then freeze the transcript chrome so summaries stay readable.",
    live: false,
  },
  {
    time: "0:31",
    speaker: "maya" as const,
    text: "Local is fine if latency holds. What’s median looking like?",
    live: true,
  },
] as const;

function NameChip({
  speaker,
  speaking,
}: {
  speaker: (typeof TILES)[number]["speaker"];
  speaking?: boolean;
}) {
  const meta = SPEAKERS[speaker];
  const ring =
    speaker === "sam"
      ? "border-dark-speaker-user/55"
      : speaker === "maya"
        ? "border-dark-speaker-remote/70"
        : speaker === "jordan"
          ? "border-[#8EC8F0]/55"
          : "border-dark-text-primary/35";

  return (
    <div
      className={`absolute bottom-2.5 left-2.5 flex h-[22px] items-center gap-1.5 rounded px-2 ${ring} border`}
    >
      {speaking ? (
        <span className="size-1.5 shrink-0 rounded-full bg-[#23D959]" />
      ) : null}
      <span className={`text-xs leading-3 font-semibold ${meta.className}`}>
        {meta.name}
      </span>
    </div>
  );
}

function Tile({
  src,
  speaker,
  speaking,
  muted,
}: {
  src: string;
  speaker: (typeof TILES)[number]["speaker"];
  speaking?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`relative flex min-h-0 grow flex-col items-center justify-center overflow-hidden rounded-md bg-[#2B2B2B] ${
        speaking ? "shadow-[inset_0_0_0_2px_var(--color-dark-speaker-remote)]" : ""
      }`}
    >
      <img
        src={src}
        alt=""
        className="absolute inset-0 size-full object-cover object-center"
      />
      <NameChip speaker={speaker} speaking={speaking} />
      {muted ? (
        <div className="absolute right-2.5 bottom-2.5 flex size-[22px] items-center justify-center rounded bg-[#0000008C]">
          <span className="h-3 w-2 shrink-0 rounded bg-[#E8E8E8]" />
        </div>
      ) : null}
    </div>
  );
}

export function SpeakerId() {
  return (
    <section
      id="speaker-id"
      className="flex min-h-[900px] w-full items-center gap-14 px-16"
    >
      <div className="flex w-[400px] shrink-0 flex-col justify-center gap-5">
        <div className="flex h-6 shrink-0 items-center self-start rounded border border-raycast-accent-red/35 bg-raycast-accent-red-soft px-2.5">
          <span className="text-xs leading-3 font-medium tracking-[0.4px] text-raycast-accent-red">
            Speaker ID
          </span>
        </div>
        <h2 className="flex w-[400px] flex-col">
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-ink">
            Names from the call,
          </span>
          <span className="text-4xl font-semibold tracking-[0.2px] text-raycast-mute">
            on the transcript.
          </span>
        </h2>
        <p className="w-[380px] text-lg text-raycast-body">
          Amie reads Zoom and Teams names as people talk. Automatic speaker
          recognition makes meeting summaries more actionable.
        </p>
        <div className="flex h-7 shrink-0 items-center gap-2 self-start rounded-sm border border-raycast-hairline-strong px-2.5">
          <span className="size-1.5 shrink-0 rounded-full bg-raycast-accent-red" />
          <span className="text-sm leading-[13px] font-medium tracking-[0.1px] text-raycast-on-dark-mute">
            Zoom · Teams
          </span>
        </div>
      </div>

      <div className="relative h-[680px] w-[856px] shrink-0 overflow-hidden">
        <div className="absolute top-0 left-0 flex h-[680px] w-[1040px] flex-col overflow-hidden rounded-lg bg-[#1C1C1C]">
          <div className="flex h-10 shrink-0 items-center px-3.5">
            <div className="flex w-14 shrink-0 items-center gap-2">
              <span className="size-3 shrink-0 rounded-full bg-[#FF5F57]" />
              <span className="size-3 shrink-0 rounded-full bg-[#FEBC2E]" />
              <span className="size-3 shrink-0 rounded-full bg-[#28C840]" />
            </div>
            <span className="grow text-center text-sm leading-[13px] font-medium text-[#D0D0D0]">
              Sprint planning
            </span>
            <span className="w-[90px] shrink-0 text-right text-xs leading-3 font-medium text-[#C8C8C8]">
              Gallery View
            </span>
          </div>

          <div className="flex min-h-0 grow flex-col gap-2 px-3 py-2">
            <div className="flex min-h-0 grow gap-2">
              <Tile {...TILES[0]} />
              <Tile {...TILES[1]} />
            </div>
            <div className="flex min-h-0 grow gap-2">
              <Tile {...TILES[2]} />
              <Tile {...TILES[3]} />
            </div>
          </div>

          <div className="flex h-[72px] shrink-0 items-center justify-center gap-7 px-5">
            <Tool label="Mute">
              <span className="h-4 w-2.5 rounded-[5px] bg-[#E8E8E8]" />
            </Tool>
            <Tool label="Stop Video">
              <span className="h-[11px] w-4 rounded-[3px] bg-[#E8E8E8]" />
            </Tool>
            <Tool label="Participants">
              <span className="text-[11px] leading-[11px] font-semibold text-[#E8E8E8]">
                4
              </span>
            </Tool>
            <Tool label="Share">
              <span className="h-2.5 w-3.5 rounded-[2px] border-[1.5px] border-solid border-[#E8E8E8]" />
            </Tool>
            <Tool label="Chat">
              <span className="h-[11px] w-3.5 rounded-[3px] bg-[#E8E8E8]" />
            </Tool>
            <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-[#E03838]">
                <span className="h-2 w-4 rounded-[2px] bg-white" />
              </div>
              <span className="text-[11px] leading-[11px] font-medium text-[#E03838]">
                Leave
              </span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-3 flex w-[832px] shrink-0 flex-col overflow-hidden rounded-t-md rounded-b-lg bg-raycast-surface shadow-[0_0_0_1px_#FFFFFF29,0_24px_64px_#0000008C]">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-raycast-hairline-soft px-5">
            <span className="text-sm leading-4 font-semibold text-raycast-ink">
              Transcript (live)
            </span>
            <span className="text-xs leading-4 font-medium tracking-[0.1px] text-raycast-on-dark-mute">
              from Zoom
            </span>
          </div>
          <div className="flex flex-col gap-3 px-5 pt-3.5 pb-4">
            {CROP.map((line) => {
              const meta = SPEAKERS[line.speaker];
              return (
                <div
                  key={line.time}
                  className={`flex items-start gap-3 ${
                    line.live
                      ? "rounded-md bg-dark-speaker-remote/12 px-2 py-1.5"
                      : ""
                  }`}
                >
                  <span className="w-9 shrink-0 text-sm leading-[22px] text-dark-text-muted">
                    {line.time}
                  </span>
                  <span
                    className={`w-14 shrink-0 text-sm leading-[22px] font-semibold ${meta.className}`}
                  >
                    {meta.name}
                  </span>
                  <span
                    className={`text-md leading-[22px] ${
                      line.live
                        ? "text-raycast-ink"
                        : "text-dark-text-secondary"
                    }`}
                  >
                    {line.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Tool({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1.5">
      <div className="flex size-9 items-center justify-center rounded-full bg-[#3A3A3A]">
        {children}
      </div>
      <span className="text-[11px] leading-[11px] text-[#C8C8C8]">{label}</span>
    </div>
  );
}
