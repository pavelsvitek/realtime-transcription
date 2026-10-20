import { cn } from "@/lib/utils";

/**
 * Monochrome silhouette marks for the Works-with row.
 * Fill via currentColor so light theme shows charcoal/muted and
 * dark theme shows off-white — matching --amie-muted on the parent.
 */

export function ZoomMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 19 20.33"
      width={17}
      height={18}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M19 20.33H2.89A2.89 2.89 0 0 1 .31 18.82a2.81 2.81 0 0 1 .51-3.27L12 4.33H4a4 4 0 0 1-4-4h14.85a2.89 2.89 0 0 1 2.58 1.51 2.81 2.81 0 0 1-.51 3.27L5.7 16.33H15A4 4 0 0 1 19 20.33Z"
      />
    </svg>
  );
}

export function TeamsMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="4 4 36 38"
      width={19}
      height={20}
      aria-hidden="true"
      focusable="false"
    >
      {/* Secondary person body */}
      <path
        fill="currentColor"
        d="M22 20h12a6 6 0 0 1 6 6v10a6 6 0 0 1-12 0V26a6 6 0 0 0-6-6Z"
      />
      {/* Primary person body */}
      <path
        fill="currentColor"
        d="M8 24a6 6 0 0 1 6-6h8a6 6 0 0 1 6 6v12a6 6 0 0 0 6 6H14C8.477 42 4 37.523 4 32V24Z"
      />
      {/* Secondary head */}
      <circle cx="33" cy="13" r="5" fill="currentColor" />
      {/* Primary head */}
      <circle cx="18" cy="10" r="6" fill="currentColor" />
      {/* T tile */}
      <rect x="4" y="23" width="16" height="16" rx="3.25" fill="currentColor" />
      {/* T letter cutout — page color so it reads on both themes */}
      <path
        fill="var(--amie-page)"
        d="M15.479 28.105h-2.447v7.466h-2.065v-7.466H8.52v-1.677h6.959z"
      />
    </svg>
  );
}

export function MeetMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox="0 0 87.5 72"
      width={22}
      height={18}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M20.5 0 0 20.5l10.55 3 9.95-3 2.95-9.41z"
      />
      <path fill="currentColor" d="M20.5 20.5H0v31h20.5z" />
      <path
        fill="currentColor"
        d="M0 51.5V66a6 6 0 0 0 6 6h14.5l3-10.96-3-9.54-9.95-3z"
      />
      <path
        fill="currentColor"
        d="M63.5 0h-43v20.5h29V36l20-16.57V6a6 6 0 0 0-6-6z"
      />
      <path
        fill="currentColor"
        d="M49.5 36v15.5h-29V72h43a6 6 0 0 0 6-6V53.08z"
      />
      <path
        fill="currentColor"
        d="M49.5 36l8.53 9.75 11.47 7.33 2-17.02-2-16.64-11.69 6.44z"
      />
      <path
        fill="currentColor"
        d="M82.6 8.68 69.5 19.42v33.66l13.16 10.79c1.97 1.54 4.85.135 4.85-2.37V11c0-2.535-2.945-3.925-4.91-2.32z"
      />
    </svg>
  );
}
