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

export function Footer() {
  return (
    <footer className="relative mt-24 w-full overflow-clip bg-raycast-canvas px-4 pt-14 pb-56 sm:px-8 md:h-[700px] md:px-20 md:pt-[72px] md:pb-0">
      <div className="flex flex-col items-start gap-12 lg:flex-row lg:justify-between lg:gap-0">
        <div className="flex max-w-[420px] flex-col gap-[18px] lg:w-[420px]">
          <div className="flex items-center gap-2.5">
            <img
              src="/amie-logo.svg"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0"
            />
            <span className="text-[17px] leading-6 font-bold tracking-tight text-dark-text-primary">
              Amie
            </span>
          </div>
          <p className="text-md text-dark-text-secondary">
            Meetings, transcribed on your Mac. Nothing leaves it.
          </p>
          <div className="flex items-center gap-2 self-start rounded-full bg-brand-accent-soft px-3 py-1.5">
            <span className="size-1.5 rounded-full bg-brand-accent" />
            <span className="text-xs text-brand-accent-ink">
              Live · on device
            </span>
          </div>
        </div>

        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-8 gap-y-10 sm:flex sm:gap-14"
        >
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3.5 sm:w-40">
              <h2 className="text-xs font-normal tracking-[0.08em] text-dark-text-muted uppercase">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-3.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-base leading-5 text-dark-text-secondary transition-colors hover:text-dark-text-primary"
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

      <div className="mt-7 h-px w-full bg-dark-border" />

      <div className="mt-7 flex flex-wrap items-center justify-between gap-2 text-sm text-dark-text-muted">
        <span>© 2026 Amie. Made for the Mac.</span>
        <span>Version 0.1.0</span>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-[60px] flex justify-center select-none md:-bottom-[175px]"
      >
        <span className="text-[200px] leading-[200px] font-bold tracking-[-0.06em] text-white opacity-[0.07] md:text-[540px] md:leading-[540px]">
          Amie
        </span>
      </div>
    </footer>
  );
}
