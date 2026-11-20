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
