import Image from "next/image";
import { cn } from "@/lib/utils";

export function WaveformMark({
  className,
  bars = 9,
}: {
  className?: string;
  bars?: number;
}) {
  const heights = [4, 8, 5, 11, 7, 13, 6, 9, 4];
  return (
    <svg
      className={cn("text-amie", className)}
      width={bars * 3}
      height="16"
      viewBox={`0 0 ${bars * 3} 16`}
      aria-hidden="true"
    >
      {heights.slice(0, bars).map((h, i) => (
        <rect
          key={i}
          x={i * 3}
          y={(16 - h) / 2}
          width="1.6"
          height={h}
          rx="0.8"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function AmieWordmark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src="/landing/amie-icon.png"
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-[8px] shadow-[0_1px_2px_rgba(15,23,42,0.12)]"
      />
      <span
        className={cn(
          "text-[15px] font-semibold tracking-[-0.02em]",
          inverted ? "text-white" : "text-current",
        )}
      >
        Amie
      </span>
    </span>
  );
}

const EQ_BARS = [
  { h: 4.6, delay: "0s" },
  { h: 6.8, delay: "0.09s" },
  { h: 10.4, delay: "0.18s" },
  { h: 7.2, delay: "0.05s" },
  { h: 13.2, delay: "0.22s" },
  { h: 9.8, delay: "0.12s" },
  { h: 15, delay: "0.27s" },
  { h: 8.4, delay: "0.07s" },
  { h: 11.6, delay: "0.2s" },
  { h: 6.4, delay: "0.14s" },
  { h: 5, delay: "0.03s" },
] as const;

export function ListeningEq({ className }: { className?: string }) {
  const width = 1.3;
  const gap = 0.55;
  const view = 26;
  const barsWidth = EQ_BARS.length * width + (EQ_BARS.length - 1) * gap;
  const startX = (view - barsWidth) / 2;

  return (
    <svg
      className={cn("amie-eq", className)}
      width="22"
      height="16"
      viewBox={`0 0 ${view} 16`}
      aria-hidden="true"
    >
      {EQ_BARS.map((bar, index) => (
        <rect
          key={index}
          className="amie-eq-bar"
          x={startX + index * (width + gap)}
          y={8 - bar.h / 2}
          width={width}
          height={bar.h}
          rx={width / 2}
          style={{ animationDelay: bar.delay }}
        />
      ))}
    </svg>
  );
}
