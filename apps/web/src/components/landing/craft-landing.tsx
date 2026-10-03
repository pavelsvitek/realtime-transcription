"use client";

import "./landing.css";
import { AmieWindow } from "./amie-window";
import { FinePrint, DownloadCta } from "./download-cta";
import { CloseCta, LandingNav } from "./nav";
import { Beats } from "./beats";

/**
 * Spec — craft
 * Who: people who buy Mac software as an object (Things / Bear / iA Writer).
 * Not: enterprise RFP, suite sprawl.
 * Default: Download for Mac.
 * Real: the window is the object; tabs still work (2+2) but the scene is still (finished note).
 * Primitives: same three, shown as a finished meeting.
 * Theme: centered poster, display type is the brand, leftover space, no fireworks.
 * Refuse: unlabeled fake quotes; motion for its own sake.
 */

const SAMPLES = [
  {
    quote: "Simply the meeting notes, on the machine you already trust.",
    source: "Sample · Mac press style",
  },
  {
    quote: "Keep your hands on the call. The transcript is waiting when you hang up.",
    source: "Sample · not a real review",
  },
];

export function CraftLanding() {
  return (
    <div className="amie-landing min-h-dvh bg-[#fbfaf7]">
      <LandingNav active="craft" />
      <main className="mx-auto flex max-w-[920px] flex-col items-center px-6 pt-12 pb-6 text-center">
        <h1 className="amie-display text-[clamp(2.6rem,7vw,4.6rem)]">
          Meetings, transcribed on your Mac.
        </h1>
        <p className="mt-5 max-w-lg text-[17px] leading-7 text-[color:var(--amie-muted)]">
          No bot in the call. A transcript when you hang up.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <DownloadCta />
          <FinePrint />
        </div>
        <div className="mt-16 w-full max-w-[820px] pb-8">
          <AmieWindow scene="finished" poster />
        </div>
      </main>
      <section className="mx-auto grid max-w-[920px] gap-10 px-6 py-12 sm:grid-cols-2">
        {SAMPLES.map((item) => (
          <figure key={item.quote} className="text-left">
            <blockquote className="amie-display text-[1.55rem] leading-snug">
              “{item.quote}”
            </blockquote>
            <figcaption className="mt-3 text-[12px] tracking-[0.08em] text-[color:var(--amie-muted)] uppercase">
              {item.source}
            </figcaption>
          </figure>
        ))}
      </section>
      <section className="mx-auto max-w-[920px] px-6 py-8">
        <Beats />
      </section>
      <CloseCta headline="A quiet object. A finished note." />
    </div>
  );
}
