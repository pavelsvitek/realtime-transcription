import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/cn";
import {
  WIZARD_NUMBERED_STEPS,
  isOptionalStep,
  wizardStepNumber,
  type WizardStep,
} from "../../lib/setup-wizard";

/** Step bars, "Step n of 5", title and copy, then the step's own content. */
export function StepLayout({
  step,
  title,
  copy,
  children,
}: {
  step: WizardStep;
  title: string;
  copy: string;
  children: ReactNode;
}) {
  const number = wizardStepNumber(step) ?? 0;
  return (
    <section className="flex w-[560px] max-w-full flex-col items-start" aria-labelledby="wizard-title">
      <StepBars current={number} />
      <p className="mt-3.5 text-[12px] leading-[17px] font-semibold tracking-[0.08em] text-text-secondary uppercase">
        Step {number} of {WIZARD_NUMBERED_STEPS}
        {isOptionalStep(step) ? " · optional" : ""}
      </p>
      <h1
        id="wizard-title"
        className="mt-1.5 text-[34px] leading-10 font-[650] tracking-[-0.025em] text-text-primary"
      >
        {title}
      </h1>
      <p className="mt-3 max-w-[520px] text-[15px] leading-[22px] text-text-secondary">{copy}</p>
      {children}
    </section>
  );
}

/** Five slim bars: done, current, to do. `current` past the last marks all done. */
export function StepBars({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: WIZARD_NUMBERED_STEPS }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 w-11 shrink-0 rounded-[2px]",
            i + 1 < current
              ? "bg-brand-accent"
              : i + 1 === current
                ? "bg-brand-speaker-user"
                : "bg-border-default",
          )}
        />
      ))}
    </div>
  );
}

export function PrimaryButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-brand-primary bg-brand-primary px-[26px] text-[14px] leading-[18px] font-[550] text-brand-on-primary enabled:hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** White button with a border, for side actions like opening System Settings. */
export function OutlineButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[38px] shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-input bg-surface-content px-[18px] text-[13.5px] leading-[18px] font-[550] text-text-primary enabled:hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** Underlined secondary action ("Skip for now", "Play the test sound again"). */
export function TextLink({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "cursor-pointer text-[13.5px] leading-5 font-[550] text-text-secondary underline decoration-1 underline-offset-auto hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export function ProgressTrack({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={cn("block w-full overflow-hidden bg-surface-muted", className)}>
      <span
        className="block h-full rounded-[inherit] bg-brand-accent transition-[width] duration-300"
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </span>
  );
}

/** Navy circle with a white check. */
export function CheckBadge({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-primary text-brand-on-primary",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Icon size={10} strokeWidth={3}>
        <path d="M20 6 9 17l-5-5" />
      </Icon>
    </span>
  );
}

/** Red ring with a dot: "not allowed yet". */
export function MissingBadge() {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded-md border-[1.5px] border-status-danger bg-status-danger-bg"
      aria-hidden="true"
    >
      <span className="size-[5px] rounded-[3px] bg-status-danger" />
    </span>
  );
}

export function Icon({
  size,
  strokeWidth = 2,
  className,
  children,
}: {
  size: number;
  strokeWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ArrowRight({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Icon>
  );
}

export function Check({ size = 13 }: { size?: number }) {
  return (
    <span className="text-text-brand">
      <Icon size={size} strokeWidth={3}>
        <path d="M20 6 9 17l-5-5" />
      </Icon>
    </span>
  );
}

export function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </Icon>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 text-[13px] leading-[19px] text-status-danger-text" role="alert">
      {children}
    </p>
  );
}
