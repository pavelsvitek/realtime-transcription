export function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={160}
      height={160}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient
          id="db-peach-body"
          x1="9.26"
          x2="13.51"
          y1="7.078"
          y2="15.94"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F9A672" offset="0" />
          <stop stopColor="#F89265" offset="1" />
        </linearGradient>
        <linearGradient
          id="db-peach-top"
          x1="9.252"
          x2="11.65"
          y1="7.078"
          y2="12.64"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FAB783" offset="0" />
          <stop stopColor="#FCA570" offset="1" />
        </linearGradient>
        <linearGradient
          id="db-coral-body"
          x1="9.271"
          x2="13.42"
          y1="13.27"
          y2="20.72"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F47A77" offset="0" />
          <stop stopColor="#EA6568" offset="1" />
        </linearGradient>
        <linearGradient
          id="db-coral-top"
          x1="9.272"
          x2="11.52"
          y1="13.24"
          y2="17.47"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F7857F" offset="0" />
          <stop stopColor="#F37A76" offset="1" />
        </linearGradient>
        <linearGradient
          id="db-rose-body"
          x1="9.264"
          x2="12.32"
          y1="18.35"
          y2="25.54"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DF5370" offset="0" />
          <stop stopColor="#D54A6A" offset="1" />
        </linearGradient>
        <linearGradient
          id="db-rose-top"
          x1="9.264"
          x2="11.3"
          y1="18.34"
          y2="22.95"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E65B79" offset="0" />
          <stop stopColor="#E45876" offset="1" />
        </linearGradient>
      </defs>
      <path
        d="m11.23 0.51h9.54c3.8 0 5.54 0.48 7.06 1.52 1.25 0.86 2.25 2.1 2.85 3.55 0.54 1.32 0.76 2.8 0.76 5.65v9.54c0 3.08-0.28 4.57-0.9 5.94-0.67 1.53-1.86 2.86-3.29 3.69-1.47 0.79-3.05 1.09-6.17 1.09h-9.85c-2.93 0-4.59-0.27-5.96-0.94-1.64-0.79-3.08-2.19-3.84-3.91-0.62-1.41-0.9-2.99-0.9-5.87v-9.54c0-2.85 0.25-4.42 0.88-5.78 0.65-1.41 1.81-2.72 3.17-3.55 1.53-0.94 3.26-1.39 6.65-1.39z"
        fill="#111111"
      />
      <path
        d="m9.25 9.02c0-0.23 0.06-0.01 0.17 0.07 1.06 0.83 3.53 1.45 6.49 1.5 3.01-0.01 5.69-0.48 6.69-1.44 0.07-0.1 0.09-0.23 0.09-0.13l-0.02 2.16c0 0.34-0.04 0.51-0.12 0.65-0.53 0.85-3.4 1.61-6.58 1.62-3.32 0-6.15-0.79-6.58-1.63-0.1-0.15-0.11-0.41-0.11-0.71l-0.03-2.09z"
        fill="url(#db-peach-body)"
      />
      <ellipse
        cx="15.96"
        cy="9.004"
        rx="6.715"
        ry="1.895"
        fill="url(#db-peach-top)"
      />
      <path
        d="m9.27 14.14c0-0.26 0.14 0.07 0.27 0.17 1.1 0.98 3.77 1.48 6.4 1.54 2.81 0 5.54-0.48 6.54-1.51 0.1-0.13 0.21-0.43 0.21-0.19l-0.02 2.11c0 0.36-0.03 0.56-0.12 0.7-0.53 0.86-3.37 1.56-6.59 1.56-3.38 0-6.22-0.81-6.59-1.63-0.08-0.15-0.09-0.39-0.09-0.72l-0.01-2.03z"
        fill="url(#db-coral-body)"
      />
      <path
        d="m10.44 13.29c1.65 0.53 3.5 0.77 5.51 0.77 2.15 0 4.2-0.3 5.69-0.82 0.67 0.13 1.05 0.44 1.05 0.85 0 1.11-3.24 1.9-6.72 1.9-3.62 0-6.69-0.88-6.69-1.86 0-0.49 0.46-0.73 1.16-0.84z"
        fill="url(#db-coral-top)"
      />
      <path
        d="m9.27 19.26c0-0.24 0.13 0.02 0.26 0.13 1.16 1.12 3.79 1.54 6.39 1.64 2.86-0.01 5.57-0.51 6.53-1.52 0.13-0.14 0.24-0.52 0.24-0.26l-0.02 2.17c0 0.33-0.03 0.49-0.1 0.61-0.47 0.85-3.43 1.58-6.62 1.58-3.41 0-6.26-0.84-6.6-1.73-0.06-0.15-0.06-0.41-0.06-0.73l-0.02-1.89z"
        fill="url(#db-rose-body)"
      />
      <path
        d="m10.48 18.39c1.63 0.52 3.58 0.78 5.49 0.78 2.13 0 4.29-0.34 5.68-0.83 0.66 0.14 1.03 0.41 1.03 0.86 0 1.08-3.23 1.88-6.74 1.88-3.64 0-6.67-0.9-6.67-1.82 0-0.54 0.45-0.77 1.21-0.87z"
        fill="url(#db-rose-top)"
      />
    </svg>
  );
}
