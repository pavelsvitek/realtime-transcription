"use client";

import { useState } from "react";
import "./landing.css";
import { AmieWindow } from "./amie-window";
import { MenuBarPill } from "./chrome";
import { FinePrint, DownloadCta } from "./download-cta";
import { CloseCta, LandingNav } from "./nav";
import { Beats } from "./beats";

/**
 * Spec — shortcut
 * Who: keyboard-first Mac users (Raycast / Alfred crowd).
 * Not: people who want a web notetaker or a SaaS form.
 * Default: Download for Mac. Demo is ⌘N.
 * Real: hotkey starts the live window (2+2). Menu-bar pill is Mac chrome we actually imply.
 * Primitives: shortcut, dual audio, local store.
 * Theme: dark, sparse, huge key. Install details in fine print (Alfred).
 * Refuse: feature grid, account form, glow mesh.
 */

export function ShortcutLanding() {
  const [listening, setListening] = useState(false);

  return (
    <div className="amie-landing amie-landing-dark min-h-dvh">
      <LandingNav active="shortcut" tone="dark" />
      <main className="mx-auto flex max-w-[980px] flex-col items-center px-6 pb-16 pt-10 text-center">
        <MenuBarPill listening={listening} />
        <p className="mt-10 font-mono text-[13px] tracking-[0.18em] text-amie-dark uppercase">
          Mac utility
        </p>
        <h1 className="amie-display mt-5 text-[clamp(3.2rem,12vw,8rem)] text-white">
          ⌘N
        </h1>
        <p className="mt-2 text-[clamp(1.2rem,3vw,1.75rem)] text-zinc-300">
          Start a meeting with ⌘N.
        </p>
        <p className="mt-4 max-w-md text-[15px] leading-6 text-zinc-500">
          No bot. No tab. A Mac app that listens to you and the room, then keeps
          the notes on disk.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <DownloadCta />
          <FinePrint className="text-zinc-500" />
        </div>
        <div className="mt-14 w-full max-w-[860px]">
          <AmieWindow
            scene="idle"
            appearance="dark"
            autoPlay={false}
            onListeningChange={setListening}
            className="h-[min(520px,60vh)] shadow-[0_30px_80px_rgba(0,0,0,0.45)]"
          />
        </div>
      </main>
      <section className="mx-auto max-w-[980px] px-6 pb-8">
        <Beats className="text-left [&_p:last-child]:text-zinc-300" />
      </section>
      <CloseCta headline="Your shortcut to the meeting notes." />
    </div>
  );
}
