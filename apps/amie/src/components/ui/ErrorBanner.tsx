import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type ErrorBannerProps = {
  children: ReactNode;
  /** Shows a × button that calls this. */
  onDismiss?: () => void;
  role?: "status" | "alert";
};

/** Full-width red strip under a page header. */
export function ErrorBanner({ children, onDismiss, role }: ErrorBannerProps) {
  return (
    <div
      role={role}
      className={cn(
        "shrink-0 border-b border-status-danger-border bg-status-danger-bg px-4 py-2 text-[13px] text-status-danger-banner-text",
        onDismiss && "flex items-start gap-3",
      )}
    >
      {onDismiss ? (
        <>
          <span className="min-w-0 flex-1">{children}</span>
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-sm border-none bg-transparent px-1 py-0 font-[family-name:inherit] text-[16px] leading-[1.2] text-inherit outline-none hover:bg-[color-mix(in_srgb,currentColor_12%,transparent)] focus-visible:bg-[color-mix(in_srgb,currentColor_12%,transparent)]"
            aria-label="Close"
            onClick={onDismiss}
          >
            ×
          </button>
        </>
      ) : (
        children
      )}
    </div>
  );
}
