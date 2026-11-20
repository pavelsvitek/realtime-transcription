import { useState } from "react";
import type { DashboardMetrics } from "@/lib/queries";

export type ChartFocus = "overview" | "meetings" | "hours" | "mcp";

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function TimeSeriesChart({
  series,
  focus,
}: {
  series: DashboardMetrics["dailySeries"];
  focus: ChartFocus;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 1096;
  const height = 220;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 18;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const isMcp = focus === "mcp";
  const primaryValues = series.map((d) => (isMcp ? d.mcpCalls : d.activeInstalls));
  const secondaryValues = series.map((d) => (isMcp ? 0 : d.meetings));

  const rawMax = Math.max(
    1,
    ...primaryValues,
    ...(isMcp ? [] : secondaryValues),
  );
  const niceMax = Math.ceil(rawMax / 4) * 4 || 4;

  const xFor = (i: number) =>
    series.length <= 1
      ? padLeft + plotW / 2
      : padLeft + (i / (series.length - 1)) * plotW;
  const yFor = (val: number) => padTop + plotH - (val / niceMax) * plotH;

  const buildLine = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`).join(" ");

  const buildArea = (vals: number[]) => {
    if (vals.length === 0) return "";
    const baseline = padTop + plotH;
    return `${buildLine(vals)} L${xFor(vals.length - 1).toFixed(1)} ${baseline} L${xFor(0).toFixed(1)} ${baseline} Z`;
  };

  const primaryPath = buildLine(primaryValues);
  const primaryArea = buildArea(primaryValues);
  const secondaryPath = isMcp ? "" : buildLine(secondaryValues);
  const secondaryArea = isMcp ? "" : buildArea(secondaryValues);

  const yTicks = [niceMax, Math.round(niceMax * 0.75), Math.round(niceMax * 0.5), Math.round(niceMax * 0.25)];
  const xTickIndices =
    series.length <= 6
      ? series.map((_, i) => i)
      : [0, 1, 2, 3, 4, 5].map((step) => Math.round((step / 5) * (series.length - 1)));

  const peakIdx = primaryValues.reduce(
    (best, val, i) => (val > primaryValues[best] ? i : best),
    0,
  );
  const activeIdx = hoverIdx ?? peakIdx;
  const activePoint = series[activeIdx];

  return (
    <div className="flex flex-col gap-3 px-6 pt-5 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[13px] font-medium text-zinc-950 dark:text-zinc-50">
          {isMcp ? "Daily MCP Tool Calls" : "Daily Active Installs & Meetings"}
        </div>
        {activePoint ? (
          <div className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
            {hoverIdx !== null ? formatShortDate(activePoint.date) : `Peak: ${formatShortDate(activePoint.date)}`}
            {" · "}
            {isMcp ? (
              <span>{activePoint.mcpCalls.toLocaleString()} calls</span>
            ) : (
              <span>
                {activePoint.activeInstalls.toLocaleString()} active installs ·{" "}
                {activePoint.meetings.toLocaleString()} meetings
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[210px] w-full min-w-[600px] select-none"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id="areaDark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--chart-primary)" }} stopOpacity="0.16" />
              <stop offset="100%" style={{ stopColor: "var(--chart-primary)" }} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="areaBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--chart-secondary)" }} stopOpacity="0.16" />
              <stop offset="100%" style={{ stopColor: "var(--chart-secondary)" }} stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick, idx) => {
            const y = yFor(tick);
            return (
              <g key={`${tick}-${idx}`}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={idx === yTicks.length - 1 ? "var(--chart-baseline)" : "var(--chart-grid)"}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="var(--chart-axis)"
                  fontSize="11"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {primaryArea && <path d={primaryArea} fill={isMcp ? "url(#areaBlue)" : "url(#areaDark)"} />}
          {secondaryArea && <path d={secondaryArea} fill="url(#areaBlue)" />}

          {primaryPath && (
            <path
              d={primaryPath}
              fill="none"
              stroke={isMcp ? "var(--chart-secondary)" : "var(--chart-primary)"}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {secondaryPath && (
            <path
              d={secondaryPath}
              fill="none"
              stroke="var(--chart-secondary)"
              strokeWidth="1.75"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 3"
            />
          )}

          {activePoint && (
            <g>
              <line
                x1={xFor(activeIdx)}
                y1={padTop}
                x2={xFor(activeIdx)}
                y2={padTop + plotH}
                stroke="var(--chart-guide)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle
                cx={xFor(activeIdx)}
                cy={yFor(primaryValues[activeIdx] ?? 0)}
                r="4.5"
                fill={isMcp ? "var(--chart-secondary)" : "var(--chart-primary)"}
                stroke="var(--chart-dot-ring)"
                strokeWidth="2"
              />
              {!isMcp && (
                <circle
                  cx={xFor(activeIdx)}
                  cy={yFor(secondaryValues[activeIdx] ?? 0)}
                  r="4"
                  fill="var(--chart-secondary)"
                  stroke="var(--chart-dot-ring)"
                  strokeWidth="2"
                />
              )}
            </g>
          )}

          {xTickIndices.map((idx) => {
            const point = series[idx];
            if (!point) return null;
            return (
              <text
                key={point.date}
                x={xFor(idx)}
                y={height - 10}
                textAnchor={idx === 0 ? "start" : idx === series.length - 1 ? "end" : "middle"}
                fill="var(--chart-x-axis)"
                fontSize="11"
              >
                {formatShortDate(point.date)}
              </text>
            );
          })}

          {series.map((point, idx) => {
            const sliceW = series.length <= 1 ? plotW : plotW / (series.length - 1);
            return (
              <rect
                key={point.date}
                x={Math.max(padLeft, xFor(idx) - sliceW / 2)}
                y={padTop}
                width={sliceW}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(idx)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
