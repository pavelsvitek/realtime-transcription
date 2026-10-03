"use client";

import "./landing.css";
import { AmieWindow } from "./amie-window";
import { Beats } from "./beats";
import { FinePrint, DownloadCta } from "./download-cta";
import { CloseCta, LandingNav } from "./nav";
import { WaveformMark } from "./mark";

/**
 * Spec — notepad
 * Who: people in back-to-back calls who refuse a meeting bot.
 * Not: teams that want a bot to join Zoom/Teams.
 * Default: Download for Mac.
 * Real: interactive Amie window; transcript writes (2+2: Start, tabs, ⌘N).
 * Primitives: start, dual listen, keep on disk — they compose in one scene.
 * Theme: light editorial paper, rose, actual Amie chrome.
 * Refuse: purple AI, headset stock, fake logos, deleting Settings/ASR as “simplicity”.
 */

export function NotepadLanding() {
  return (
    <div className="amie-landing min-h-dvh bg-[#f4efe8]">
      <LandingNav active="notepad" />
      <main className="mx-auto grid max-w-[1180px] items-center gap-12 px-6 pb-8 pt-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:px-8 lg:pt-10">
        <div className="flex flex-col items-start gap-6">
          <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
            <WaveformMark />
            Mac meeting recorder
          </p>
          <h1 className="amie-display text-[clamp(2.4rem,6vw,4.1rem)]">
            The notepad for meetings.
            <span className="block text-[color:var(--amie-muted)]">
              No bot on the call.
            </span>
          </h1>
          <p className="max-w-md text-[17px] leading-7 text-[color:var(--amie-ink)]">
            Start a meeting. Amie listens to you and the room. Transcript and
            summary stay on this Mac.
          </p>
          <DownloadCta />
          <FinePrint />
        </div>
        <AmieWindow scene="idle" autoPlay />
      </main>
      <section className="mx-auto max-w-[1180px] px-6 py-16 lg:px-8">
        <p className="mb-8 text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
          Before · during · after
        </p>
        <Beats numbered />
      </section>
      <CloseCta headline="Leave the call with notes. Not a bot." />
    </div>
  );
}
