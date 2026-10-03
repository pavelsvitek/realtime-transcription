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
}: {
  active?: string;
  tone?: "light" | "dark";
  showVariants?: boolean;
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
