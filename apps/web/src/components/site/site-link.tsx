import { Link } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";

type SiteLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** Root-relative path with optional hash (`/privacy#rights`), or an external/placeholder href. */
  href: string;
};

/**
 * Thin stand-in for `next/link`: internal `/path#hash` hrefs go through the
 * router (client-side navigation, hash scroll); everything else is a plain anchor.
 */
export function SiteLink({ href, children, ...rest }: SiteLinkProps) {
  if (!href.startsWith("/")) {
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  }
  const [to, hash] = href.split("#");
  return (
    <Link to={to || "/"} hash={hash || undefined} {...rest}>
      {children}
    </Link>
  );
}
