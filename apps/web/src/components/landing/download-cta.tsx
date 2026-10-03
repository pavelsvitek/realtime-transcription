import { DOWNLOAD_HREF } from "./copy";
import { cn } from "@/lib/utils";

export function DownloadCta({
  className,
  children = "Download for Mac",
}: {
  className?: string;
  children?: string;
}) {
  return (
    <a href={DOWNLOAD_HREF} className={cn("amie-cta", className)}>
      {children}
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
