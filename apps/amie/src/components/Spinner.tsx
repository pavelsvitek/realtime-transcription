import { cn } from "../lib/cn";

type SpinnerProps = {
  className?: string;
};

export function Spinner({ className }: SpinnerProps) {
  return (
    <svg
      className={cn("animate-spinner", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-30"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
