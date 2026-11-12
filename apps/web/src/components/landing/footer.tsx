import Image from "next/image";

type FooterLink = { label: string; href: string };

const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#word-by-word" },
      { label: "Speaker names", href: "#speaker-id" },
      { label: "Meeting summaries", href: "#meeting-summary" },
      { label: "Local MCP", href: "#local-mcp" },
    ],
  },
  {
    title: "Get Amie",
    links: [
      { label: "Download for Mac", href: "#download" },
      { label: "Release notes", href: "#" },
      { label: "Docs", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Privacy", href: "#local-mcp" },
      { label: "Security", href: "#" },
      { label: "Terms", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 h-[700px] w-full overflow-clip bg-raycast-canvas">
      <div className="mx-auto max-w-[1440px] px-20 pt-[72px]">
        <div className="flex items-start justify-between">
          <div className="flex w-[420px] flex-col gap-[18px]">
            <div className="flex items-center gap-2.5">
              <Image
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

          <nav aria-label="Footer" className="flex gap-14">
            {columns.map((column) => (
              <div key={column.title} className="flex w-40 flex-col gap-3.5">
                <h2 className="text-xs font-normal tracking-[0.08em] text-dark-text-muted uppercase">
                  {column.title}
                </h2>
                <ul className="flex flex-col gap-3.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-base leading-5 text-dark-text-secondary transition-colors hover:text-dark-text-primary"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-7 h-px w-full bg-dark-border" />

        <div className="mt-7 flex items-center justify-between text-sm text-dark-text-muted">
          <span>© 2026 Amie. Made for the Mac.</span>
          <span>Version 0.1.0</span>
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -bottom-[175px] flex justify-center select-none"
      >
        <span className="text-[540px] leading-[540px] font-bold tracking-[-0.06em] text-white opacity-[0.07]">
          Amie
        </span>
      </div>
    </footer>
  );
}
