import { DownloadButton } from "@/components/site/download-button";
import { SiteLink as Link } from "@/components/site/site-link";

// Links are root-relative (`/#section`) so the same nav works on the landing
// page and on subpages like /privacy and /terms.
const links = [
  { label: "How it works", href: "/#word-by-word" },
  { label: "Privacy", href: "/#local-mcp" },
];

export function PrimaryNav({ className = "" }: { className?: string }) {
  return (
    <nav className={`relative z-30 flex h-14 w-full shrink-0 items-center justify-between border-b border-raycast-hairline-soft px-4 md:px-12 ${className}`}>
      <Link href="/#top" className="flex items-center gap-2">
        <img
          src="/amie-app-icon.png"
          alt=""
          width={24}
          height={24}
          className="size-6"
        />
        <span className="text-base leading-5 font-semibold text-raycast-ink">
          Amie
        </span>
      </Link>
      <div className="flex items-center gap-5 md:gap-6">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hidden text-sm leading-5 font-medium tracking-[0.014em] text-raycast-body sm:inline"
          >
            {link.label}
          </Link>
        ))}
        <DownloadButton location="nav" className="flex h-8 cursor-pointer items-center justify-center rounded-md bg-raycast-primary px-3.5 text-sm leading-5 font-semibold tracking-[0.014em] text-raycast-on-primary disabled:opacity-70">
          Download
        </DownloadButton>
      </div>
    </nav>
  );
}
