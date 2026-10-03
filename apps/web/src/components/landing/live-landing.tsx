"use client";

import { useState } from "react";
import "./landing.css";
import { AmieWindow } from "./amie-window";
import { MenuBarPill } from "./chrome";
import { FinePrint, DownloadCta } from "./download-cta";
import { LandingNav } from "./nav";
import { BEATS } from "./copy";
import { WaveformMark } from "./mark";

/**
 * Spec — live
 * Who: people who will not believe dual transcript until they see User / Remote move.
 * Not: abstract “AI notepad” art.
 * Default: Download for Mac; the page itself is the demo (Screen Studio / Wispr).
 * Real: full-bleed Amie UI auto-plays the dual stream. Start/Stop and tabs complete a task.
 * Primitives: start, dual listen, keep — composing in the live scene.
 * Theme: product chrome, slim copy column. Motion because the product is time-based.
 * Refuse: particle fields, a second product in the footer.
 */

export function LiveLanding() {
  const [listening, setListening] = useState(true);

  return (
    <div className="amie-landing relative min-h-dvh overflow-hidden bg-[#ececec]">
      <div className="relative z-10">
        <LandingNav active="live" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center max-md:hidden">
        <div className="pointer-events-none">
          <MenuBarPill listening={listening} />
        </div>
      </div>
      <main className="relative grid min-h-[calc(100dvh-64px)] lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <aside className="flex flex-col justify-between gap-8 px-6 py-8 lg:px-8 lg:py-12">
          <div>
            <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
              <WaveformMark />
              Live dual transcript
            </p>
            <h1 className="amie-display mt-4 text-[clamp(2rem,4vw,3.1rem)]">
              No bot in the call. A transcript when you hang up.
            </h1>
            <p className="mt-4 text-[15px] leading-6 text-[color:var(--amie-muted)]">
              User is your mic. Remote is the room. Same window, same disk.
            </p>
            <div id="download" className="mt-6 flex flex-col items-start gap-3">
              <DownloadCta />
              <FinePrint />
            </div>
          </div>
          <ol className="flex flex-col gap-4">
            {BEATS.map((beat) => (
              <li key={beat.key}>
                <p className="text-[12px] font-semibold tracking-[0.14em] text-amie uppercase">
                  {beat.title}
                </p>
                <p className="mt-1 text-[14px] leading-5 text-[color:var(--amie-ink)]">
                  {beat.body}
                </p>
              </li>
            ))}
          </ol>
        </aside>
        <div className="min-h-[520px] p-3 pb-6 lg:p-6">
          <AmieWindow
            scene="live"
            autoPlay
            onListeningChange={setListening}
            className="h-full min-h-[520px] rounded-[10px] shadow-[0_20px_60px_rgba(15,23,42,0.16)]"
          />
        </div>
      </main>
    </div>
  );
}
