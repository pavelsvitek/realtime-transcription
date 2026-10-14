"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { McpPhase } from "@/hooks/use-mcp-story";

export const DATA_PATH = "M4 28 C 90 28, 200 220, 328 252";

type Packet = { x: number; y: number; opacity: number; size: number };

function packetTimes(phase: McpPhase, progress: number): number[] | null {
  if (phase === "query" || phase === "response") return null;

  if (phase === "request") {
    const head = progress;
    return [head, head - 0.16, head - 0.32];
  }

  if (phase === "lookup") {
    return [0.82, 0.91, 1];
  }

  const head = 1 - progress;
  return [head, head + 0.16, head + 0.32];
}

function packetsAlongPath(
  path: SVGPathElement,
  phase: McpPhase,
  progress: number,
): Packet[] {
  const times = packetTimes(phase, progress);
  if (!times) return [];
  const length = path.getTotalLength();
  const next: Packet[] = [];
  times.forEach((t, index) => {
    if (t < 0 || t > 1) return;
    const point = path.getPointAtLength(t * length);
    const arriving = phase === "lookup" && index === 2;
    const leaving = phase === "reply" && index === 0;
    next.push({
      x: point.x,
      y: point.y,
      opacity:
        arriving || leaving
          ? 1
          : 0.45 + 0.55 * (1 - Math.abs(0.5 - t) * 0.4),
      size: arriving || leaving ? 10 : 8,
    });
  });
  return next;
}

export function DataFlow({
  phase,
  progress,
}: {
  phase: McpPhase;
  progress: number;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const transferring =
    phase === "request" || phase === "lookup" || phase === "reply";
  const lineOpacity = transferring ? 1 : 0.35;
  const [packets, setPackets] = useState<Packet[]>([]);

  useLayoutEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    setPackets(packetsAlongPath(path, phase, progress));
  }, [phase, progress]);

  return (
    <svg
      width={332}
      height={280}
      viewBox="0 0 332 280"
      className="overflow-visible"
      aria-hidden
    >
      <defs>
        <filter
          id="packet-glow"
          x="-80%"
          y="-80%"
          width="260%"
          height="260%"
        >
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        ref={pathRef}
        d={DATA_PATH}
        fill="none"
        stroke="var(--color-raycast-accent-blue)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 8"
        className={transferring ? "dash-flow" : undefined}
        style={{ opacity: lineOpacity }}
      />
      {packets.map((packet, i) => (
        <circle
          key={i}
          cx={packet.x}
          cy={packet.y}
          r={packet.size / 2}
          fill="var(--color-raycast-accent-blue)"
          opacity={packet.opacity}
          filter="url(#packet-glow)"
        />
      ))}
    </svg>
  );
}
