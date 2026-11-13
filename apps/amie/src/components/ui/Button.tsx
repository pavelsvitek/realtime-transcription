import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "danger" | "outline" | "secondary" | "accent";
export type ButtonSize = "md" | "lg";

const BASE =
  "cursor-pointer border border-transparent font-[family-name:inherit] text-[13px] outline-none transition-all duration-150 ease-[ease] disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<ButtonVariant, string> = {
  /** Filled navy: the main action. */
  primary: "bg-brand-primary text-brand-on-primary enabled:hover:bg-brand-primary-hover",
  /** Filled red: stopping a recording or deleting. */
  danger:
    "bg-status-danger text-white enabled:hover:bg-status-danger-hover disabled:opacity-100",
  /** Transparent with a border: low-emphasis actions such as Clear. */
  outline: "border-border-input bg-transparent text-text-muted hover:bg-surface-hover",
  /** Light fill with a border: the quiet choice next to a primary button. */
  secondary:
    "border-border-default bg-surface-input text-text-primary enabled:hover:bg-surface-hover",
  /** Soft blue: permission and setup actions. */
  accent:
    "bg-brand-accent-soft text-brand-accent-ink enabled:hover:bg-brand-accent-soft-hover disabled:opacity-55",
};

const SIZES: Record<ButtonSize, string> = {
  md: "rounded-md px-4 py-1.5 font-medium",
  /** Dialog and onboarding actions. */
  lg: "justify-center rounded-[10px] px-3 py-2.5 text-center font-semibold",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...props}
    />
  );
}
