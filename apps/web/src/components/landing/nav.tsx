"use client";

import Link from "next/link";
import { AmieWordmark } from "./mark";
import { DownloadCta } from "./download-cta";
import { VARIANTS } from "./copy";
import { cn } from "@/lib/utils";

export function LandingNav({
  active,
  tone = "light",
  showVariants = true,
  onToggleTheme,
}: {
  active?: string;
  tone?: "light" | "dark";
  showVariants?: boolean;
  onToggleTheme?: () => void;
}) {
  const dark = tone === "dark";
  return (
    <header className="flex flex-col gap-2 px-5 py-4 md:px-8">
      <div className="flex items-center gap-4">
        <Link href="/" className="shrink-0" aria-label="Amie landing index">
          <AmieWordmark inverted={dark} />
        </Link>
        {showVariants ? (
          <nav
            aria-label="Landing variants"
            className="hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:flex"
          >
            {VARIANTS.map((variant) => (
              <Link
                key={variant.slug}
                href={variant.href}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                  active === variant.slug
                    ? dark
                      ? "text-white"
                      : "text-[color:var(--amie-ink)]"
                    : dark
                      ? "text-zinc-500 hover:text-zinc-200"
                      : "text-[color:var(--amie-muted)] hover:text-[color:var(--amie-ink)]",
                )}
              >
                {variant.title}
              </Link>
            ))}
          </nav>
        ) : (
          <div className="flex-1" />
        )}
        <div className="ml-auto flex items-center gap-3">
          {onToggleTheme ? (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-md",
                dark
                  ? "text-zinc-400 hover:bg-white/10 hover:text-zinc-100"
                  : "text-[color:var(--amie-muted)] hover:bg-black/5 hover:text-[color:var(--amie-ink)]",
              )}
            >
              {dark ? <SunIcon /> : <MoonIcon />}
            </button>
          ) : null}
          <Link
            href="/session"
            className={cn(
              "hidden text-[13px] font-medium sm:inline",
              dark
                ? "text-zinc-500 hover:text-zinc-200"
                : "text-[color:var(--amie-muted)] hover:text-[color:var(--amie-ink)]",
            )}
          >
            Playground
          </Link>
          <DownloadCta className="h-8 px-3 text-[13px]" />
        </div>
      </div>
      {showVariants ? (
        <nav
          aria-label="Landing variants"
          className="flex gap-1 overflow-x-auto sm:hidden"
        >
          {VARIANTS.map((variant) => (
            <Link
              key={variant.slug}
              href={variant.href}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[12px] font-medium",
                active === variant.slug
                  ? "text-amie"
                  : dark
                    ? "text-zinc-500"
                    : "text-[color:var(--amie-muted)]",
              )}
            >
              {variant.title}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

export function CloseCta({
  headline = "Start something small on your Mac.",
}: {
  headline?: string;
}) {
  return (
    <section
      id="download"
      className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4 px-6 py-20 text-center"
    >
      <h2 className="amie-display text-[clamp(1.8rem,4vw,2.6rem)]">
        {headline}
      </h2>
      <DownloadCta />
    </section>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5Z" />
    </svg>
  );
}
