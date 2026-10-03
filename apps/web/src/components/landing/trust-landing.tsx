"use client";

import "./landing.css";
import { AmieWindow } from "./amie-window";
import { Beats } from "./beats";
import { FinePrint, DownloadCta } from "./download-cta";
import { CloseCta, LandingNav } from "./nav";
import { STORE_PATH } from "./copy";
import { WaveformMark } from "./mark";

/**
 * Spec — trust
 * Who: people who will not put meetings in someone else’s cloud.
 * Not: “just send it to our SaaS.” We do not have ISO/DORA — do not fake Jamie badges.
 * Default: Download for Mac.
 * Real: window opens on Settings (path + local/xAI as modes of one engine) and Meetings files.
 * Primitives: on-device SQLite, no bot, optional cloud keys (mode, not a second product).
 * Theme: light, quiet, fact strip. Stillness.
 * Refuse: invented compliance logos, adjectives without a path.
 */

const FACTS = [
  {
    title: "On this Mac",
    body: `SQLite at ${STORE_PATH}`,
  },
  {
    title: "No bot in the call",
    body: "Capture is mic + system audio on the desktop. Nothing joins Zoom or Teams.",
  },
  {
    title: "Cloud is a mode",
    body: "Local Nemotron is the default. xAI / OpenAI / Gemini only if you paste a key.",
  },
];

export function TrustLanding() {
  return (
    <div className="amie-landing min-h-dvh bg-[#f7f7f6]">
      <LandingNav active="trust" />
      <main className="mx-auto max-w-[1040px] px-6 pt-10 pb-8 lg:px-8">
        <p className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.16em] text-amie uppercase">
          <WaveformMark />
          Made for Mac
        </p>
        <h1 className="amie-display mt-4 max-w-3xl text-[clamp(2.3rem,5.4vw,3.6rem)]">
          Your meetings stay on this Mac.
        </h1>
        <p className="mt-4 max-w-xl text-[17px] leading-7 text-[color:var(--amie-muted)]">
          Capture does not require the cloud. Dual stream is local. Summaries
          are the same engine with an optional key — not a different product.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <DownloadCta />
          <FinePrint />
        </div>
      </main>
      <section className="border-y border-[color:var(--amie-line)] bg-white">
        <ul className="mx-auto grid max-w-[1040px] gap-8 px-6 py-10 sm:grid-cols-3 lg:px-8">
          {FACTS.map((fact) => (
            <li key={fact.title}>
              <p className="text-[13px] font-semibold">{fact.title}</p>
              <p className="mt-2 text-[14px] leading-6 text-[color:var(--amie-muted)]">
                {fact.body}
              </p>
            </li>
          ))}
        </ul>
      </section>
      <section className="mx-auto grid max-w-[1040px] items-start gap-10 px-6 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-8">
        <div>
          <h2 className="amie-display text-[2rem]">Quiet proof.</h2>
          <p className="mt-3 text-[15px] leading-6 text-[color:var(--amie-muted)]">
            Open Settings in the window. The store path is real. Switch ASR —
            it is still one pipeline. Then look at Meetings: files, not a
            workspace in the sky.
          </p>
          <div className="mt-8">
            <Beats className="sm:grid-cols-1" />
          </div>
        </div>
        <AmieWindow
          scene="privacy"
          className="h-[min(560px,70vh)] shadow-[0_16px_40px_rgba(15,23,42,0.08)]"
        />
      </section>
      <CloseCta headline="Keep the meeting on this Mac." />
    </div>
  );
}
