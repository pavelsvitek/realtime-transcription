import { useId, useState, type ReactNode } from "react";

type TooltipProps = {
  content: string;
  children: ReactNode;
};

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open && (
        <span
          className="pointer-events-none absolute top-[calc(100%+8px)] left-1/2 z-[1000] max-w-[240px] -translate-x-1/2 rounded-md border border-border-input bg-surface-elevated px-2.5 py-1.5 text-[12px] leading-[1.35] whitespace-nowrap text-text-primary shadow-[0_8px_24px_rgba(0,0,0,0.18)] after:absolute after:bottom-full after:left-1/2 after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-b-surface-elevated"
          id={tooltipId}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
}
