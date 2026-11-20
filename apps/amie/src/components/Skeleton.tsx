import { cn } from "../lib/cn";

type SkeletonLinesProps = {
  /** Width of each line as a CSS percentage, top to bottom. */
  widths?: number[];
  className?: string;
};

const DEFAULT_WIDTHS = [92, 78, 85, 60, 88, 70];

/** Pulsing placeholder lines shown while a meeting body is loading. */
export function SkeletonLines({
  widths = DEFAULT_WIDTHS,
  className,
}: SkeletonLinesProps) {
  return (
    <div
      className={cn("flex max-w-[720px] flex-col gap-3", className)}
      role="status"
      aria-label="Loading meeting"
    >
      {widths.map((width, index) => (
        <div
          key={index}
          className="h-[14px] animate-pulse rounded-md bg-surface-hover"
          style={{ width: `${width}%` }}
        />
      ))}
    </div>
  );
}

/** Placeholder day cards shaped like the Meetings list while it first loads. */
export function SkeletonMeetingList() {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-6 pt-2 pb-8"
      role="status"
      aria-label="Loading meetings"
    >
      {[3, 2].map((rows, group) => (
        <div
          key={group}
          className="rounded-2xl border border-border-default px-[18px] pt-4 pb-2"
        >
          <div className="mb-3 h-[13px] w-24 animate-pulse rounded-md bg-surface-hover" />
          {Array.from({ length: rows }, (_, row) => (
            <div key={row} className="flex items-start gap-3 pt-2.5 pb-3">
              <div className="w-0.5 self-stretch rounded-[1px] bg-border-input" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-[15px] w-2/5 animate-pulse rounded-md bg-surface-hover" />
                <div className="h-[12px] w-16 animate-pulse rounded-md bg-surface-hover" />
                <div className="h-[13px] w-4/5 animate-pulse rounded-md bg-surface-hover" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
