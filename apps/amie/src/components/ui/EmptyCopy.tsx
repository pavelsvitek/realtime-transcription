import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/** Short secondary sentence for an empty panel ("Summary is generated after…"). */
export function EmptyCopy({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <p
      className={cn(
        "m-0 max-w-[420px] text-center text-[13px] leading-[1.45] text-text-secondary",
        className,
      )}
    >
      {children}
    </p>
  );
}
