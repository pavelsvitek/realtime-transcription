import { SiteLink as Link } from "@/components/site/site-link";

type FooterLink = { label: string; href: string };

// Root-relative hrefs so the footer works the same on every page.
const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/#word-by-word" },
      { label: "Speaker names", href: "/#speaker-id" },
      { label: "Meeting summaries", href: "/#meeting-summary" },
      { label: "Local MCP", href: "/#local-mcp" },
      { label: "FAQ", href: "/#faq" },
    ],
  },
  {
    title: "Get Amie",
    links: [
      { label: "Download for Mac", href: "/#download" },
      { label: "Release notes", href: "#" },
      { label: "Docs", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Security", href: "#" },
      { label: "Terms", href: "/terms" },
      { label: "Support", href: "/support" },
    ],
  },
];

/** Crisp 1:1 Swiss flag SVG so it renders consistently across macOS, Windows, and Linux. */
function SwissFlagIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="inline-block shrink-0 rounded-[2px]"
      role="img"
      aria-label="Switzerland"
    >
      <rect width="14" height="14" fill="#D52B1E" />
      <rect x="5.75" y="2.75" width="2.5" height="8.5" fill="#FFFFFF" />
      <rect x="2.75" y="5.75" width="8.5" height="2.5" fill="#FFFFFF" />
    </svg>
  );
}

export function Footer() {
  const currentYear = new Date().getUTCFullYear();

  return (
    <footer className="relative mt-20 w-full overflow-clip bg-raycast-canvas px-4 pt-12 pb-48 sm:px-8 md:h-[595px] md:px-16 md:pt-16 md:pb-0 xl:px-0">
      <div className="mx-auto w-full max-w-[1440px] xl:px-[162px]">
      <div className="flex flex-col items-start gap-10 lg:flex-row lg:justify-between lg:gap-0">
        <div className="flex max-w-[360px] flex-col gap-3.5 lg:w-[360px]">
          <div className="flex items-center gap-2">
            <img
              src="/amie-logo.svg"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0"
            />
            <span className="text-[15px] leading-5 font-bold tracking-tight text-dark-text-primary">
              Amie
            </span>
          </div>
          <p className="text-base text-dark-text-secondary">
            Meetings, transcribed on your Mac. Nothing leaves it.
          </p>
          <div className="flex items-center gap-1.5 self-start rounded-full bg-brand-accent-soft px-2.5 py-1">
            <span className="size-[5px] rounded-full bg-brand-accent" />
            <span className="text-[11px] text-brand-accent-ink">
              Real-time · Runs on your Mac
            </span>
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-8 gap-y-8 sm:flex sm:gap-12"
        >
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3 sm:w-36">
              <h2 className="text-[11px] font-normal tracking-[0.08em] text-dark-text-muted uppercase">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm leading-5 text-dark-text-secondary transition-colors hover:text-dark-text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-6 h-px w-full bg-dark-border" />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-dark-text-muted">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span>Built in Switzerland</span>
          <SwissFlagIcon />
          <span aria-hidden>·</span>
          <span>{currentYear}</span>
          <span aria-hidden>·</span>
          <span>
            by{" "}
            <a
              href="http://pavelsvitek.com/?ref=amie-website"
              target="_blank"
              rel="noopener noreferrer"
              className="text-dark-text-secondary underline decoration-white/20 underline-offset-4 transition-colors hover:text-dark-text-primary hover:decoration-white/50"
            >
              Pavel Svitek
            </a>
          </span>
        </span>
        <span>Made for the Mac</span>
      </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-[50px] flex justify-center select-none md:-bottom-[150px]"
      >
        <span className="text-[170px] leading-[170px] font-bold tracking-[-0.06em] text-white opacity-[0.07] md:text-[460px] md:leading-[460px]">
          Amie
        </span>
      </div>
    </footer>
  );
}
