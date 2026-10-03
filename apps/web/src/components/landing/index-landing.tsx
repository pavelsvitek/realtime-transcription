"use client";

import Link from "next/link";
import "./landing.css";
import { VARIANTS } from "./copy";
import { AmieWordmark } from "./mark";
import { DownloadCta, FinePrint } from "./download-cta";

/**
 * Spec — index
 * Who: us, reviewing five stories. Not a sixth marketing pitch.
 * Default: pick a layout. Playground stays at /session.
 * Real: links into live pages (the variants are the product of this work).
 * Theme: same rose, wordmark, leftover space.
 * Refuse: a new aesthetic, a feature laundry list.
 */

const CARDS = [
  {
    ...VARIANTS[0],
    layout: "Light editorial. Window right of copy.",
  },
  {
    ...VARIANTS[1],
    layout: "Dark, huge ⌘N, sparse utility.",
  },
  {
    ...VARIANTS[2],
    layout: "Privacy strip. Quieter demo.",
  },
  {
    ...VARIANTS[3],
    layout: "Centered poster. Still object.",
  },
  {
    ...VARIANTS[4],
    layout: "Full-bleed live dual transcript.",
  },
] as const;

export function IndexLanding() {
  return (
    <div className="amie-landing min-h-dvh bg-[#f6f4f1]">
      <header className="flex items-center justify-between px-6 py-5 md:px-10">
        <AmieWordmark />
        <div className="flex items-center gap-4">
          <Link
            href="/session"
            className="text-[13px] font-medium text-[color:var(--amie-muted)] hover:text-[color:var(--amie-ink)]"
          >
            Session playground
          </Link>
          <DownloadCta className="h-8 px-3 text-[13px]" />
        </div>
      </header>
      <main className="mx-auto max-w-[980px] px-6 pb-20 pt-10 md:px-10">
        <h1 className="amie-display text-[clamp(2.2rem,6vw,3.8rem)]">
          Five ways to say Amie.
        </h1>
        <p className="mt-4 max-w-xl text-[16px] leading-7 text-[color:var(--amie-muted)]">
          Same job — capture the meeting without a bot, leave with notes on this
          Mac. Different layout each time. Not five color themes.
        </p>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {CARDS.map((card) => (
            <li key={card.slug}>
              <Link
                href={card.href}
                className="block rounded-[14px] border border-[color:var(--amie-line)] bg-white px-5 py-5 transition-colors hover:border-amie"
              >
                <p className="text-[12px] font-semibold tracking-[0.14em] text-amie uppercase">
                  {card.title}
                </p>
                <p className="amie-display mt-2 text-[1.7rem] leading-tight">
                  {card.story}
                </p>
                <p className="mt-3 text-[13px] text-[color:var(--amie-muted)]">
                  {card.layout}
                </p>
              </Link>
            </li>
          ))}
          <li className="sm:col-span-2">
            <Link
              href="/session"
              className="block rounded-[14px] border border-dashed border-[color:var(--amie-line)] px-5 py-5 text-[14px] text-[color:var(--amie-muted)] hover:border-amie hover:text-[color:var(--amie-ink)]"
            >
              Session playground remains at /session — the old live-copilot UI,
              not these marketing pages.
            </Link>
          </li>
        </ul>
        <div className="mt-12">
          <FinePrint />
        </div>
      </main>
    </div>
  );
}
