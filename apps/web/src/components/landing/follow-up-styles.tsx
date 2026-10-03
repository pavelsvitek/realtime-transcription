import type { ReactNode } from "react";
import { AmieWindow } from "./amie-window";
import { DEMO_CONTEXT, DEMO_HANDOFF } from "./copy";
import { cn } from "@/lib/utils";

const WINDOW = "h-[min(400px,52vh)] min-h-[320px] w-full min-w-0";
const WINDOW_TALL = "h-[min(440px,58vh)] min-h-[360px] w-full min-w-0";

function shade(dark: boolean) {
  return dark
    ? "shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
    : "shadow-[0_16px_40px_rgba(15,23,42,0.10)]";
}

function FollowWindow({
  appearance,
  scene,
  className,
  contextText,
  revealPreviousSummary = true,
}: {
  appearance: "light" | "dark";
  scene: "finished" | "followup";
  className?: string;
  contextText?: string;
  revealPreviousSummary?: boolean;
}) {
  return (
    <AmieWindow
      scene={scene}
      chrome="content"
      hideFollowUpBanner
      revealPreviousSummary={revealPreviousSummary}
      contextText={contextText}
      appearance={appearance}
      className={className}
    />
  );
}

export function LastCallSheet({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <aside
      className={cn(
        "w-full rounded-[14px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-5 py-5",
        className,
      )}
    >
      <p className="text-[13px] leading-5 text-[color:var(--amie-muted)]">
        Hiring plan
        <span className="mt-0.5 block text-[12px] text-[color:var(--amie-faint)]">
          Today · 24 min
        </span>
      </p>
      <ul className={cn("mt-4 flex flex-col gap-3", compact && "gap-2")}>
        {DEMO_HANDOFF.map((item) => (
          <li key={item.text} className="text-[14px] leading-6 text-[color:var(--amie-ink)]">
            <span className="font-semibold text-amie">{item.kind}</span>
            <span className="mt-0.5 block">{item.text}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function CarryMark({
  direction = "auto",
}: {
  direction?: "auto" | "right" | "down";
}) {
  const vertical = direction === "down";
  const horizontal = direction === "right";
  return (
    <div className="flex flex-col items-center justify-center gap-2 lg:px-1">
      <p className="sr-only">
        Command-shift-N carries the last summary into the next meeting
      </p>
      <svg
        className={cn(
          "h-10 w-5 text-amie",
          direction === "auto" && "lg:hidden",
          horizontal && "hidden",
        )}
        viewBox="0 0 20 40"
        fill="none"
        aria-hidden="true"
      >
        <path className="amie-carry-line" d="M10 2v28" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5 26l5 8 5-8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg
        className={cn(
          "h-4 w-[4.5rem] text-amie",
          direction === "auto" ? "hidden lg:block" : horizontal ? "block" : "hidden",
          vertical && "hidden",
        )}
        viewBox="0 0 72 16"
        fill="none"
        aria-hidden="true"
      >
        <path className="amie-carry-line" d="M2 8h56" stroke="currentColor" strokeWidth="1.5" />
        <path d="M52 3l12 5-12 5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <kbd className="rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-2.5 py-1.5 font-mono text-[13px] font-semibold tracking-tight text-amie shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
        ⌘⇧N
      </kbd>
    </div>
  );
}

/** A1 — two equal Amie windows with a key in the gutter. */
export function FollowStylePair({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-3">
      <div className="lg:translate-y-6">
        <FollowWindow appearance={appearance} scene="finished" className={cn(WINDOW, shade(dark))} />
      </div>
      <CarryMark />
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW, shade(dark))} />
    </div>
  );
}

/** A2 — last call recedes; new meeting overlaps its corner. */
export function FollowStyleOverlap({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid grid-cols-12">
      <div
        className={cn(
          "col-span-11 row-start-1 origin-top-left scale-[0.85] opacity-70 saturate-50 lg:col-span-7",
          dark && "brightness-90",
        )}
      >
        <FollowWindow appearance={appearance} scene="finished" className={cn(WINDOW_TALL, "shadow-none")} />
      </div>
      <div className="relative z-10 col-span-11 col-start-2 row-start-1 mt-48 lg:col-span-8 lg:col-start-5 lg:mt-20">
        <kbd className="absolute -top-4 -left-4 z-20 rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-3 py-2 font-mono text-[13px] font-semibold tracking-tight text-amie shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
          ⌘⇧N
        </kbd>
        <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW_TALL, shade(dark))} />
      </div>
    </div>
  );
}

/** A3 — last-call paper walks into New meeting. */
export function FollowStyleWalk({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,0.38fr)_auto_minmax(0,1fr)] lg:gap-3">
      <LastCallSheet className="-rotate-1 shadow-[0_18px_40px_rgba(0,0,0,0.18)]" />
      <CarryMark />
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW_TALL, shade(dark))} />
    </div>
  );
}

/** A4 — hang up, hit the keys, already briefed. */
export function FollowStyleComic({ appearance }: { appearance: "light" | "dark" }) {
  return (
    <div data-appearance={appearance} className="grid gap-3 md:grid-cols-3">
      <ComicPanel caption="Call ends">
        <LastCallSheet compact className="shadow-none" />
      </ComicPanel>
      <ComicPanel caption="Open the next one">
        <div className="flex min-h-[220px] items-center justify-center">
          <kbd className="rounded-[14px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-5 py-4 font-mono text-[28px] font-semibold tracking-tight text-amie shadow-[0_12px_28px_rgba(0,0,0,0.16)]">
            ⌘⇧N
          </kbd>
        </div>
      </ComicPanel>
      <ComicPanel caption="Already briefed">
        <LastCallSheet compact className="border-amie/40 shadow-none" />
      </ComicPanel>
    </div>
  );
}

function ComicPanel({
  caption,
  children,
}: {
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure className="flex flex-col overflow-hidden rounded-[12px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)]">
      <div className="min-h-0 flex-1 p-3">{children}</div>
      <figcaption className="border-t border-[color:var(--amie-line)] px-3 py-2 text-[13px] text-[color:var(--amie-muted)]">
        {caption}
      </figcaption>
    </figure>
  );
}

/** A5 — same New meeting, blank context vs carried context. */
export function FollowStyleDelta({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <figure className="min-w-0">
        <FollowWindow
          appearance={appearance}
          scene="followup"
          contextText={DEMO_CONTEXT}
          revealPreviousSummary={false}
          className={cn(WINDOW, shade(dark))}
        />
        <figcaption className="mt-3 text-[13px] text-[color:var(--amie-muted)]">
          ⌘N · empty context
        </figcaption>
      </figure>
      <figure className="min-w-0">
        <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW, shade(dark))} />
        <figcaption className="mt-3 text-[13px] text-[color:var(--amie-muted)]">
          ⌘⇧N · last call already in
        </figcaption>
      </figure>
    </div>
  );
}

/** A6 — two meetings on a date line, rose thread between them. */
export function FollowStyleTimeline({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <ol className="relative flex flex-col gap-10 pl-6">
        <span
          aria-hidden
          className="absolute top-2 bottom-2 left-[7px] w-px bg-[color:var(--amie-line)]"
        />
        <span
          aria-hidden
          className="amie-timeline-thread absolute top-[4.5rem] left-[6px] h-[5.5rem] w-[3px] rounded-full bg-amie"
        />
        <li className="relative">
          <span className="absolute top-1.5 -left-6 size-[15px] rounded-full border-2 border-amie bg-[color:var(--amie-page)]" />
          <p className="text-[13px] text-[color:var(--amie-muted)]">Thu · 3:10</p>
          <LastCallSheet className="mt-2 shadow-[0_12px_28px_rgba(0,0,0,0.12)]" compact />
        </li>
        <li className="relative">
          <span className="absolute top-1.5 -left-6 size-[15px] rounded-full bg-amie" />
          <p className="text-[13px] text-[color:var(--amie-muted)]">
            Fri · 9:00
            <span className="ml-2 font-medium text-amie">carried · ⌘⇧N</span>
          </p>
          <p className="amie-display mt-1 text-[1.6rem]">New meeting</p>
        </li>
      </ol>
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW_TALL, shade(dark))} />
    </div>
  );
}

/** A7 — a sticky lifts off Hiring plan and sits on the next call. */
export function FollowStylePeel({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid items-end gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="relative pb-8">
        <FollowWindow appearance={appearance} scene="finished" className={cn(WINDOW, shade(dark))} />
        <StickyNote className="amie-sticky-peel absolute -right-3 -bottom-2 w-[min(260px,70%)]" />
      </div>
      <div className="relative pt-6">
        <StickyNote className="absolute -top-2 left-6 z-10 w-[min(260px,70%)]" />
        <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW, shade(dark))} />
      </div>
    </div>
  );
}

function StickyNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-[4px] bg-[#f3d2c7] px-3 py-3 text-[#3a2428] shadow-[4px_14px_24px_rgba(0,0,0,0.18)]",
        className,
      )}
    >
      <p className="text-[11px] font-semibold">From Hiring plan</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[12px] leading-5">
        {DEMO_HANDOFF.map((item) => (
          <li key={item.text}>
            <span className="font-semibold">{item.kind}.</span> {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A8 — Hiring plan.md dropped onto New meeting. */
export function FollowStyleFolder({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,0.36fr)_auto_minmax(0,1fr)]">
      <div className="rounded-[12px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] p-3">
        <p className="px-2 pb-2 text-[12px] text-[color:var(--amie-muted)]">
          ~/Documents/Amie
        </p>
        <ul className="divide-y divide-[color:var(--amie-line)]">
          <FinderRow name="Design critique.md" muted />
          <FinderRow name="Hiring plan.md" active />
          <FinderRow name="Customer interview.md" muted />
        </ul>
      </div>
      <CarryMark />
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW_TALL, shade(dark))} />
    </div>
  );
}

function FinderRow({ name, active = false, muted = false }: { name: string; active?: boolean; muted?: boolean }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 px-2 py-2.5 text-[13px]",
        active && "rounded-md bg-amie/12 font-medium text-amie",
        muted && "text-[color:var(--amie-faint)]",
      )}
    >
      <FileMark />
      {name}
    </li>
  );
}

function FileMark() {
  return (
    <svg viewBox="0 0 16 18" className="size-4 shrink-0" aria-hidden="true">
      <path
        d="M3 1.5h6l4 4V16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M9 1.5V6h4" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

/** A9 — the shortcut is the actor; it punches through the last note. */
export function FollowStyleKey({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="relative">
        <LastCallSheet className="shadow-[0_18px_40px_rgba(0,0,0,0.16)]" />
        <p
          aria-hidden
          className="amie-punch-key pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-mono font-semibold text-amie"
        >
          ⌘⇧N
        </p>
      </div>
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW_TALL, shade(dark))} />
    </div>
  );
}

/** A10 — last call sealed, next call opened. */
export function FollowStyleEnvelope({ appearance }: { appearance: "light" | "dark" }) {
  const dark = appearance === "dark";
  return (
    <div className="grid items-center gap-6 lg:grid-cols-[minmax(200px,0.34fr)_auto_minmax(200px,0.34fr)_minmax(0,1fr)]">
      <Envelope closed />
      <CarryMark />
      <Envelope />
      <FollowWindow appearance={appearance} scene="followup" className={cn(WINDOW, shade(dark))} />
    </div>
  );
}

function Envelope({ closed = false }: { closed?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[240px]">
      <div className="relative overflow-hidden rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)]">
        <div className="amie-envelope-flap h-10 border-b border-[color:var(--amie-line)] bg-[color:var(--amie-shell)]" />
        <div className="px-4 py-4">
          {closed ? (
            <p className="text-center text-[13px] leading-6 text-[color:var(--amie-muted)]">
              Hiring plan
              <span className="mt-2 block">
                <span className="inline-block rounded-full bg-amie px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  Sealed
                </span>
              </span>
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-[12px] leading-5 text-[color:var(--amie-ink)]">
              {DEMO_HANDOFF.map((item) => (
                <li key={item.text}>
                  <span className="font-semibold text-amie">{item.kind}.</span> {item.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-2 text-center text-[12px] text-[color:var(--amie-muted)]">
        {closed ? "After the call" : "Opened on ⌘⇧N"}
      </p>
    </div>
  );
}

export const FOLLOW_UP_STYLES = [
  { id: "pair", name: "Last-call / next-call pair", Style: FollowStylePair },
  { id: "overlap", name: "Overlapping windows", Style: FollowStyleOverlap },
  { id: "walk", name: "The brief walks", Style: FollowStyleWalk },
  { id: "comic", name: "Three panels", Style: FollowStyleComic },
  { id: "delta", name: "Empty versus filled", Style: FollowStyleDelta },
  { id: "timeline", name: "Timeline spine", Style: FollowStyleTimeline },
  { id: "peel", name: "Peeling sticky", Style: FollowStylePeel },
  { id: "folder", name: "Folder drop", Style: FollowStyleFolder },
  { id: "key", name: "Command key as actor", Style: FollowStyleKey },
  { id: "envelope", name: "Mail merge", Style: FollowStyleEnvelope },
] as const;
