import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type DialogProps = {
  /** Called when the backdrop is pressed. Omit to keep the dialog open. */
  onDismiss?: () => void;
  role?: "dialog" | "alertdialog";
  titleId: string;
  descriptionId: string;
  className?: string;
  children: ReactNode;
};

/** Centred modal panel over a dimmed backdrop. Focus and Escape stay with the caller. */
export function Dialog({
  onDismiss,
  role = "alertdialog",
  titleId,
  descriptionId,
  className,
  children,
}: DialogProps) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[rgba(15,23,42,0.4)]"
      onPointerDown={onDismiss}
    >
      <div
        className={cn(
          "flex max-w-[380px] min-w-[280px] flex-col gap-4 rounded-2xl border border-border-default bg-surface-elevated p-5 shadow-[0_10px_30px_rgba(15,23,42,0.18)]",
          className,
        )}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

type TextProps = { id: string; className?: string; children: ReactNode };

export function DialogTitle({ id, className, children }: TextProps) {
  return (
    <p id={id} className={cn("m-0 text-[16px] font-semibold text-text-primary", className)}>
      {children}
    </p>
  );
}

export function DialogDescription({ id, className, children }: TextProps) {
  return (
    <p id={id} className={cn("m-0 text-[14px] leading-[1.45] text-text-secondary", className)}>
      {children}
    </p>
  );
}
