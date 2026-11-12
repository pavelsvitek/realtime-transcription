import { DownloadButton } from "@/components/site/download-button";
import { SiteLink as Link } from "@/components/site/site-link";

// Links are root-relative (`/#section`) so the same nav works on the landing
// page and on subpages like /privacy and /terms.
const links = [
  { label: "How it works", href: "/#word-by-word" },
  { label: "Privacy", href: "/#local-mcp" },
];

export function PrimaryNav() {
  return (
    <nav className="relative z-20 flex h-14 w-full shrink-0 items-center justify-between border-b border-raycast-hairline-soft px-4 md:px-12">
      <Link href="/#top" className="flex items-center gap-2.5">
        <img
          src="/amie-app-icon.png"
          alt=""
          width={28}
          height={28}
          className="size-7"
        />
        <span className="text-base leading-[22px] font-semibold text-raycast-ink">
          Amie
        </span>
      </Link>
      <div className="flex items-center gap-5 md:gap-7">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="hidden text-base leading-[22px] font-medium tracking-[0.014em] text-raycast-body sm:inline"
          >
            {link.label}
          </Link>
        ))}
        <DownloadButton className="flex h-9 cursor-pointer items-center justify-center rounded-md bg-raycast-primary px-4 text-base leading-[22px] font-semibold tracking-[0.014em] text-raycast-on-primary disabled:opacity-70">
          Download
        </DownloadButton>
      </div>
    </nav>
  );
}
