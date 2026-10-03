"use client";

import "./landing.css";
import { AmieWindow } from "./amie-window";
import { FinePrint, DownloadCta } from "./download-cta";
import { CloseCta, LandingNav } from "./nav";
import { WaveformMark } from "./mark";
import { cn } from "@/lib/utils";
import Image from "next/image";
import type { ReactNode } from "react";

/**
 * Spec — notepad
 * Who: people on Zoom / Meet / Teams who refuse a meeting bot.
 * Not: a bot that joins the call; not a suite.
 * Default: Download for Mac. Price is Free.
 * Real: interactive Amie window in the hero; benefit scenes for context, speakers, follow-up.
 * Refuse: Before/During/After filler; unlabeled fake quotes; invented Pro tier.
 */

const PREVIEW =
  "h-[min(400px,52vh)] min-h-[320px] w-full min-w-0 shadow-[0_16px_40px_rgba(15,23,42,0.10)]";

const BENEFITS = [
  {
    kicker: "On this Mac",
    title: "Real-time transcription, on device",
    body: "Words appear as you talk. Amie runs a voice model on your Mac — not a wait-until-the-call-ends upload.",
  },
  {
    kicker: "Context",
    title: "Brief the summary before you hang up",
    body: "Add participants, the topic, anything the recap should know. The summary uses that context instead of a generic dump of the transcript.",
    scene: "context" as const,
  },
  {
    kicker: "Speakers",
    title: "Names from Zoom and Teams",
    body: "Allow Accessibility in System Settings. Amie reads the active speaker from Zoom or Microsoft Teams and labels the transcript in real time.",
    scene: "speakers" as const,
    reverse: true,
  },
  {
    kicker: "Follow-up",
    title: "The next meeting already knows this one",
    body: "Start a follow-up and Amie copies the previous summary and context. No re-brief. ⌘⇧N.",
    scene: "files" as const,
  },
  {
    kicker: "Keyboard",
    title: "Hands on the keys",
    body: "Shortcuts for people who already live in a launcher. Start, stop, follow up, move between Home, Transcription, Meetings, and Settings.",
    keys: true,
    reverse: true,
  },
];

const SHORTCUTS = [
  { keys: "⌘N", label: "Start a meeting" },
  { keys: "⌘⇧N", label: "Follow-up meeting" },
  { keys: "⌘⌫", label: "Stop" },
  { keys: "⌘1–4", label: "Move around the app" },
];

const QUOTES = [
  {
    quote: "Notes from Zoom without a notetaker in the waiting room.",
    source: "Sample · not a real review",
  },
  {
    quote: "The summary is usable when I seed context. Otherwise it’s just a transcript.",
    source: "Sample · Mac press style",
  },
];

const FAQS = [
  {
    q: "Is it really free?",
    a: "Yes. I’m building it for myself.",
  },
  {
    q: "How does the voice transcribe to text so fast?",
    a: "The app downloads a voice model to your device and uses it to transcribe in real time.",
  },
  {
    q: "Which AI is used to make the summary?",
    a: "You put your own API key in the Settings page for OpenAI, Gemini, or xAI.",
  },
];

export function NotepadLanding() {
  return (
    <div className="amie-landing min-h-dvh bg-[#f4efe8]">
      <LandingNav active="notepad" />
      <main className="mx-auto grid w-full max-w-[1360px] items-center gap-10 px-6 pb-8 pt-6 lg:grid-cols-[minmax(280px,0.42fr)_minmax(0,0.85fr)] lg:px-8 lg:pt-10">
        <div className="flex max-w-lg flex-col items-start gap-6">
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
            <WaveformMark />
            For Zoom, Meet, and Teams
          </p>
          <h1 className="amie-display text-[clamp(2.2rem,5.4vw,3.7rem)]">
            The notepad for video calls.
            <span className="block text-[color:var(--amie-muted)]">
              No bot on the call.
            </span>
          </h1>
          <p className="max-w-md text-[17px] leading-7 text-[color:var(--amie-ink)]">
            Amie sits on your Mac — not in Google Meet, Zoom, or Microsoft Teams.
            Live transcript while you talk. A summary when you hang up.
          </p>
          <DownloadCta />
          <FinePrint />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <AmieWindow
            scene="idle"
            autoPlay
            className="h-[min(540px,68vh)] min-h-[440px] w-full min-w-0"
          />
          <WorksWith />
        </div>
      </main>

      <div className="mx-auto flex max-w-[1180px] flex-col gap-24 px-6 py-20 lg:px-8">
        {BENEFITS.map((benefit) => (
          <BenefitRow key={benefit.title} {...benefit} />
        ))}
      </div>

      <section className="border-y border-[color:var(--amie-line)] bg-[#fbf8f3]">
        <div className="mx-auto grid max-w-[1180px] gap-12 px-6 py-20 sm:grid-cols-2 lg:px-8">
          {QUOTES.map((item) => (
            <figure key={item.quote}>
              <blockquote className="amie-display text-[1.55rem] leading-snug">
                “{item.quote}”
              </blockquote>
              <figcaption className="mt-3 text-[12px] tracking-[0.08em] text-[color:var(--amie-muted)] uppercase">
                {item.source}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[640px] px-6 py-20 text-center lg:px-8">
        <p className="text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
          Pricing
        </p>
        <h2 className="amie-display mt-3 text-[clamp(2rem,4vw,3rem)]">Free</h2>
        <p className="mt-3 text-[16px] leading-7 text-[color:var(--amie-muted)]">
          Download for Mac. I’m building Amie for my own calls. No paid tier, no
          account.
        </p>
        <div className="mt-6 flex flex-col items-center gap-3">
          <DownloadCta />
          <FinePrint />
        </div>
      </section>

      <section className="mx-auto w-full max-w-[720px] px-6 pb-8 lg:px-8">
        <h2 className="amie-display text-[clamp(1.8rem,3vw,2.4rem)]">FAQ</h2>
        <div className="mt-8 divide-y divide-[color:var(--amie-line)] border-y border-[color:var(--amie-line)]">
          {FAQS.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="cursor-pointer list-none text-[16px] font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-baseline justify-between gap-4">
                  {item.q}
                  <span className="text-[color:var(--amie-faint)] group-open:hidden">
                    +
                  </span>
                  <span className="hidden text-[color:var(--amie-faint)] group-open:inline">
                    −
                  </span>
                </span>
              </summary>
              <p className="mt-3 max-w-xl text-[15px] leading-7 text-[color:var(--amie-muted)]">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <CloseCta headline="Leave the call with notes. Not a bot." />
    </div>
  );
}

function WorksWith() {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] leading-5 text-[color:var(--amie-muted)]">
      <span>Works with:</span>
      <span className="inline-flex items-center gap-1.5">
        <Image
          src="/landing/logo-zoom.svg"
          alt=""
          width={17}
          height={18}
          unoptimized
          className="h-[18px] w-[17px] shrink-0 object-contain"
        />
        Zoom,
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Image
          src="/landing/logo-teams.svg"
          alt=""
          width={19}
          height={20}
          unoptimized
          className="h-[20px] w-[19px] shrink-0 object-contain"
        />
        MS Teams and
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Image
          src="/landing/logo-meet.svg"
          alt=""
          width={22}
          height={18}
          unoptimized
          className="h-[18px] w-[22px] shrink-0 object-contain"
        />
        Google Meet
      </span>
      <span>and others</span>
    </p>
  );
}

function BenefitRow({
  kicker,
  title,
  body,
  scene,
  keys,
  reverse = false,
}: {
  kicker: string;
  title: string;
  body: string;
  scene?: "context" | "speakers" | "files";
  keys?: boolean;
  reverse?: boolean;
}) {
  const visual: ReactNode = keys ? (
    <ul className="grid gap-3 sm:grid-cols-2">
      {SHORTCUTS.map((item) => (
        <li
          key={item.keys}
          className="flex items-center gap-3 rounded-[12px] border border-[color:var(--amie-line)] bg-white px-4 py-3"
        >
          <kbd className="font-mono text-[13px] font-semibold tracking-tight text-amie">
            {item.keys}
          </kbd>
          <span className="text-[14px] text-[color:var(--amie-ink)]">
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  ) : scene ? (
    <AmieWindow scene={scene} namedSpeakers={scene === "speakers"} className={PREVIEW} />
  ) : null;

  const copy = (
      <div>
        <p className="text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
          {kicker}
        </p>
        <h2 className="amie-display mt-3 text-[clamp(1.7rem,3vw,2.35rem)]">
          {title}
        </h2>
        <p className="mt-3 max-w-md text-[16px] leading-7 text-[color:var(--amie-muted)]">
          {body}
        </p>
      </div>
  );

  const media = visual ? <div>{visual}</div> : null;

  return (
    <article
      className={cn(
        "grid items-center gap-10",
        visual &&
          (reverse
            ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
            : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"),
      )}
    >
      {reverse && media ? (
        <>
          {media}
          {copy}
        </>
      ) : (
        <>
          {copy}
          {media}
        </>
      )}
    </article>
  );
}
