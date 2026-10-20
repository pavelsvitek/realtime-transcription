import { cn } from "@/lib/utils";
import { DOWNLOAD_HREF } from "./copy";

export function DownloadCta({
  className,
  children = "Download for Mac &mdash; For Free",
}: {
  className?: string;
  children?: string;
}) {
  return (
    <a href={DOWNLOAD_HREF} className={cn("amie-cta", className)} dangerouslySetInnerHTML={{ __html: children }}>
    </a>
  );
}

export function FinePrint({
  className,
  children,
}: {
  className?: string;
  children?: string;
}) {
  return (
    <p
      className={cn(
        "text-[12px] leading-5 text-[color:var(--amie-muted)]",
        className,
      )}
    >
      {children ??
        "macOS 13+ · Apple silicon · on-device SQLite. Download is a placeholder until a release URL exists."}
    </p>
  );
}
