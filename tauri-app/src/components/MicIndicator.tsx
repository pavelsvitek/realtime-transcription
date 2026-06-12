type MicIndicatorProps = {
  isActive: boolean;
  micActive: boolean;
  error: string | null;
};

export function MicIndicator({ isActive, micActive, error }: MicIndicatorProps) {
  let color: string;
  if (error) {
    color = "#ef4444";
  } else if (isActive && micActive) {
    color = "#22c55e";
  } else {
    color = "#9ca3af";
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, transition: "stroke 0.15s ease" }}
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}
