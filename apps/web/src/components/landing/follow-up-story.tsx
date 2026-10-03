import { AmieWindow } from "./amie-window";
import { DEMO_HANDOFF } from "./copy";
import { cn } from "@/lib/utils";

const WINDOW =
  "h-[min(440px,58vh)] min-h-[360px] w-full min-w-0";

export function FollowUpStory({
  appearance,
}: {
  appearance: "light" | "dark";
}) {
  const dark = appearance === "dark";

  return (
    <article className="flex flex-col gap-10">
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(220px,0.38fr)_auto_minmax(0,1fr)] lg:gap-3">
        <LastCallSheet />
        <CarryMark />
        <AmieWindow
          scene="followup"
          chrome="content"
          hideFollowUpBanner
          revealPreviousSummary
          appearance={appearance}
          className={cn(
            WINDOW,
            dark
              ? "shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
              : "shadow-[0_16px_40px_rgba(15,23,42,0.10)]",
          )}
        />
      </div>
      <div className="max-w-xl">
        <h2 className="amie-display text-[clamp(1.7rem,3vw,2.35rem)]">
          Last call’s decisions open the next one
        </h2>
        <p className="mt-3 text-[16px] leading-7 text-[color:var(--amie-muted)]">
          ⌘⇧N puts the brief in context. You start talking. You don’t re-explain
          Friday.
        </p>
      </div>
    </article>
  );
}

function LastCallSheet() {
  return (
    <aside className="relative mx-auto w-full max-w-sm -rotate-1 rounded-[14px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-5 py-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
      <p className="text-[13px] leading-5 text-[color:var(--amie-muted)]">
        Hiring plan
        <span className="mt-0.5 block text-[12px] text-[color:var(--amie-faint)]">
          Today · 24 min
        </span>
      </p>
      <ul className="mt-4 flex flex-col gap-3">
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

function CarryMark() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 lg:px-1">
      <p className="sr-only">
        Command-shift-N carries the last summary into the next meeting
      </p>
      <svg
        className="h-10 w-5 text-amie lg:hidden"
        viewBox="0 0 20 40"
        fill="none"
        aria-hidden="true"
      >
        <path
          className="amie-carry-line"
          d="M10 2v28"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M5 26l5 8 5-8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <svg
        className="hidden h-4 w-[4.5rem] text-amie lg:block"
        viewBox="0 0 72 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          className="amie-carry-line"
          d="M2 8h56"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M52 3l12 5-12 5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <kbd className="rounded-[10px] border border-[color:var(--amie-line)] bg-[color:var(--amie-card)] px-2.5 py-1.5 font-mono text-[13px] font-semibold tracking-tight text-amie shadow-[0_8px_20px_rgba(0,0,0,0.16)]">
        ⌘⇧N
      </kbd>
    </div>
  );
}
