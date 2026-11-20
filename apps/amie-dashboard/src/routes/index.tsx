import { useCallback, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import {
  parseRangeDays,
  queryDashboardMetrics,
  type DashboardMetrics,
  type DateRangeDays,
} from "@/lib/queries";
import { useTheme, type ThemePreference } from "@/lib/theme";
import { TimeSeriesChart, type ChartFocus } from "@/components/TimeSeriesChart";

const loadInitialMetrics = createServerFn({ method: "GET" }).handler(async () => {
  return queryDashboardMetrics(env.TELEMETRY_DB, 30, "all");
});

export const Route = createFileRoute("/")({
  loader: async () => loadInitialMetrics(),
  component: DashboardPage,
});

type NavTab = "overview" | "feedback";

function formatDelta(pct: number | null): string | null {
  if (pct === null) return null;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}%`;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function categoryBadgeClass(category: string): string {
  switch (category) {
    case "missing_capability":
    case "tool_error":
      return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-900/70";
    case "workflow_friction":
      return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-400 dark:border-amber-900/70";
    case "poor_results":
      return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-400 dark:border-blue-900/70";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  }
}

function DeltaPill({
  delta,
  variant = "green",
}: {
  delta: number | null;
  variant?: "green" | "blue";
}) {
  const text = formatDelta(delta);
  if (!text) return null;
  const isNegative = (delta ?? 0) < 0;
  const styles = isNegative
    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/60 dark:border-red-900/70 dark:text-red-400"
    : variant === "blue"
      ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/60 dark:border-blue-900/70 dark:text-blue-400"
      : "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/60 dark:border-green-900/70 dark:text-green-400";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${styles}`}
    >
      {text}
    </span>
  );
}

function ThemeToggle({
  preference,
  onCycle,
}: {
  preference: ThemePreference;
  onCycle: () => void;
}) {
  const label =
    preference === "dark" ? "Dark" : preference === "light" ? "Light" : "System";

  return (
    <button
      type="button"
      onClick={onCycle}
      title={`Theme: ${label} (click to switch)`}
      aria-label={`Switch theme (current: ${label})`}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
    >
      {preference === "dark" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ) : preference === "light" ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.93 4.93 1.41 1.41" />
          <path d="m17.66 17.66 1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m6.34 17.66-1.41 1.41" />
          <path d="m19.07 4.93-1.41 1.41" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" x2="16" y1="21" y2="21" />
          <line x1="12" x2="12" y1="17" y2="21" />
        </svg>
      )}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function DashboardPage() {
  const initial = Route.useLoaderData();
  const [data, setData] = useState<DashboardMetrics>(initial);
  const [rangeDays, setRangeDays] = useState<DateRangeDays>(initial.rangeDays);
  const [version, setVersion] = useState<string>(initial.versionFilter);
  const [chartFocus, setChartFocus] = useState<ChartFocus>("overview");
  const [navTab, setNavTab] = useState<NavTab>("overview");
  const [loading, setLoading] = useState(false);
  const { preference, cycleTheme } = useTheme();

  const fetchMetrics = useCallback(async (days: DateRangeDays, nextVersion: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        days: String(days),
        version: nextVersion,
      });
      const res = await fetch(`/api/metrics?${params.toString()}`);
      if (res.ok) {
        const next: DashboardMetrics = await res.json();
        setData(next);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRangeChange = (next: DateRangeDays) => {
    setRangeDays(next);
    void fetchMetrics(next, version);
  };

  const handleVersionChange = (nextVersion: string) => {
    setVersion(nextVersion);
    void fetchMetrics(rangeDays, nextVersion);
  };

  const countryLeft = data.wauByCountry.rows.slice(0, 3);
  const countryRight = data.wauByCountry.rows.slice(3, 6);
  const maxCountryWau = Math.max(1, ...data.wauByCountry.rows.map((r) => r.wau));

  return (
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      {/* Sidebar */}
      <aside className="hidden w-[240px] shrink-0 flex-col justify-between border-r border-zinc-200 bg-white px-3 py-4 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-zinc-900 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950">
              A
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-4 tracking-[-0.01em] text-zinc-950 dark:text-zinc-50">
                Amie Telemetry
              </div>
              <div className="truncate text-[11px] leading-3.5 text-zinc-500 dark:text-zinc-400">
                dashboard.getamie.app
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
              Analytics
            </div>
            <button
              type="button"
              onClick={() => setNavTab("overview")}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "overview"
                  ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              <span>Overview</span>
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
              MCP Server
            </div>
            <button
              type="button"
              onClick={() => setNavTab("feedback")}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "feedback"
                  ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Feedback Inbox</span>
              </span>
              <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums dark:bg-zinc-100 dark:text-zinc-950">
                {data.feedbackTotal}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-600 dark:bg-green-500" />
              <span className="text-xs font-medium text-zinc-950 dark:text-zinc-100">
                D1 EU Connected
              </span>
            </div>
            <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">EEUR</span>
          </div>
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            amie-telemetry · Cloudflare Access
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-7 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-zinc-500 dark:text-zinc-400">Amie</span>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="font-semibold text-zinc-950 dark:text-zinc-50">
              {navTab === "overview" ? "Overview" : "Feedback Inbox"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
              <span className="text-zinc-500 dark:text-zinc-400">Version:</span>
              <select
                value={version}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="cursor-pointer bg-transparent font-medium text-zinc-950 outline-none dark:text-zinc-100"
              >
                <option value="all" className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100">
                  All versions
                </option>
                {data.availableVersions.map((v) => (
                  <option
                    key={v}
                    value={v}
                    className="bg-white text-zinc-950 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    v{v}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex h-8 items-center gap-0.5 rounded-[7px] bg-zinc-100 p-[3px] dark:bg-zinc-800">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleRangeChange(parseRangeDays(String(d)))}
                  className={`h-[26px] cursor-pointer rounded-[5px] px-2.5 text-xs transition-all ${
                    rangeDays === d
                      ? "bg-white font-semibold text-zinc-950 shadow-xs dark:bg-zinc-950 dark:text-zinc-50"
                      : "font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void fetchMetrics(rangeDays, version)}
              disabled={loading}
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <ThemeToggle preference={preference} onCycle={cycleTheme} />
          </div>
        </header>

        {navTab === "feedback" ? (
          <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-7 pt-6 pb-10">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                  MCP Feedback Inbox
                </h1>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  All anonymized capability gaps reported by AI agents via{" "}
                  <code className="font-mono text-xs">report_feedback</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab("overview")}
                className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                ← Back to Overview
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              {data.feedback.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No MCP feedback reports yet.
                </div>
              ) : (
                data.feedback.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/60"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                        >
                          {item.category}
                        </span>
                        <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                          {item.clientName}
                          {item.clientVersion ? ` ${item.clientVersion}` : ""}
                        </span>
                        {item.toolsTried.map((tool) => (
                          <span
                            key={tool}
                            className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">
                      {item.goal}
                    </div>
                    <div className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                      {item.limitation}
                    </div>
                    {item.suggestedImprovement && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-medium text-zinc-700 dark:text-zinc-300">
                          Suggested:{" "}
                        </span>
                        {item.suggestedImprovement}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </main>
        ) : (
          <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-7 pt-6 pb-10">
            {/* Page Header */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950 dark:text-zinc-50">
                  Product Telemetry
                </h1>
                <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                  Anonymous desktop app &amp; MCP server metrics · Last {rangeDays} days
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-zinc-900 dark:bg-zinc-100" />
                  Active Installs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-blue-600 dark:bg-blue-400" />
                  Meetings Recorded
                </span>
              </div>
            </div>

            {/* Primary Metrics Card (KPI Tabs + Chart) */}
            <section className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="grid grid-cols-1 border-b border-zinc-200 sm:grid-cols-2 lg:grid-cols-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setChartFocus("overview")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors sm:border-r lg:border-b-0 dark:border-zinc-800 ${
                    chartFocus === "overview"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b] dark:bg-zinc-900 dark:shadow-[inset_0_-2px_0_0_#fafafa]"
                      : "bg-zinc-50/70 hover:bg-zinc-50 dark:bg-zinc-950/50 dark:hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Active Installs ({rangeDays}d)
                    </span>
                    <DeltaPill delta={data.kpis.activeInstallsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums dark:text-zinc-50">
                    {data.kpis.activeInstalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                    DAU {data.kpis.dau} · WAU {data.kpis.wau} · +{data.kpis.newInstalls} new
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("meetings")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors lg:border-r lg:border-b-0 dark:border-zinc-800 ${
                    chartFocus === "meetings"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b] dark:bg-zinc-900 dark:shadow-[inset_0_-2px_0_0_#fafafa]"
                      : "bg-zinc-50/70 hover:bg-zinc-50 dark:bg-zinc-950/50 dark:hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Meetings Recorded
                    </span>
                    <DeltaPill delta={data.kpis.meetingsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums dark:text-zinc-50">
                    {data.kpis.meetings.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                    {data.kpis.avgMeetingsPerInstall} avg / active install
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("hours")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors sm:border-r sm:border-b-0 dark:border-zinc-800 ${
                    chartFocus === "hours"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b] dark:bg-zinc-900 dark:shadow-[inset_0_-2px_0_0_#fafafa]"
                      : "bg-zinc-50/70 hover:bg-zinc-50 dark:bg-zinc-950/50 dark:hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      Transcribed Hours
                    </span>
                    <DeltaPill delta={data.kpis.transcribedHoursDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums dark:text-zinc-50">
                    {data.kpis.transcribedHours.toLocaleString()}h
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                    {data.kpis.avgMeetingMinutes} min avg duration
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("mcp")}
                  className={`flex cursor-pointer flex-col gap-1.5 p-5 text-left transition-colors ${
                    chartFocus === "mcp"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#2563eb] dark:bg-zinc-900 dark:shadow-[inset_0_-2px_0_0_#60a5fa]"
                      : "bg-zinc-50/70 hover:bg-zinc-50 dark:bg-zinc-950/50 dark:hover:bg-zinc-900/70"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      MCP Tool Calls
                    </span>
                    <DeltaPill delta={data.kpis.mcpCallsDeltaPct} variant="blue" />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums dark:text-zinc-50">
                    {data.kpis.mcpCalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums dark:text-zinc-400">
                    {data.kpis.mcpActiveInstalls} installs · {data.kpis.mcpOkPct}% ok
                  </div>
                </button>
              </div>

              <TimeSeriesChart series={data.dailySeries} focus={chartFocus} />
            </section>

            {/* Middle Row: Feature Adoption + MCP Agents & Tools */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Feature Adoption
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Unique active installs using each capability ({rangeDays}d)
                    </p>
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    By installs
                  </span>
                </div>

                <div className="flex flex-col gap-3.5">
                  {data.features.map((feat) => (
                    <div key={feat.eventKey} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-zinc-950 dark:text-zinc-100">
                            {feat.label}
                          </span>
                          <span className="hidden font-mono text-[11px] text-zinc-500 sm:inline dark:text-zinc-400">
                            {feat.eventKey}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 tabular-nums">
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {feat.totalRuns.toLocaleString()}{" "}
                            {feat.eventKey === "mcp_session_started" ? "calls" : "runs"}
                          </span>
                          <span className="w-[82px] text-right font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
                            {feat.uniqueInstalls} ({feat.adoptionPct}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                        <div
                          className={`h-full rounded-full ${
                            feat.accent === "blue"
                              ? "bg-blue-600 dark:bg-blue-500"
                              : "bg-zinc-900 dark:bg-zinc-100"
                          }`}
                          style={{ width: `${Math.min(100, feat.adoptionPct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      MCP Agents &amp; Tools
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Connected AI clients &amp; tool call volume
                    </p>
                  </div>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 tabular-nums dark:border-blue-900/70 dark:bg-blue-950/60 dark:text-blue-400">
                    {data.kpis.mcpActiveInstalls} active installs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {data.mcpAgents.map((agent) => (
                    <div
                      key={agent.label}
                      className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/60"
                    >
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {agent.label}
                      </span>
                      <span className="text-base font-semibold text-zinc-950 tabular-nums dark:text-zinc-50">
                        {agent.pct}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center border-b border-zinc-200 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <div className="flex-1">Tool</div>
                    <div className="w-[72px] text-right">Calls</div>
                    <div className="w-[68px] text-right">OK %</div>
                    <div className="w-[64px] text-right">Avg ms</div>
                  </div>
                  {data.mcpTools.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                      No MCP tool calls recorded in this window.
                    </div>
                  ) : (
                    data.mcpTools.map((tool) => (
                      <div
                        key={tool.tool}
                        className="flex items-center border-b border-zinc-100 py-2 text-xs last:border-b-0 tabular-nums dark:border-zinc-800/70"
                      >
                        <div className="flex-1 truncate font-mono font-medium text-zinc-950 dark:text-zinc-100">
                          {tool.tool}
                        </div>
                        <div className="w-[72px] text-right font-semibold text-zinc-950 dark:text-zinc-50">
                          {tool.calls.toLocaleString()}
                        </div>
                        <div
                          className={`w-[68px] text-right ${
                            tool.okPct >= 97
                              ? "text-green-700 dark:text-green-400"
                              : "text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {tool.okPct}%
                        </div>
                        <div className="w-[64px] text-right text-zinc-500 dark:text-zinc-400">
                          {tool.avgMs} ms
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Bottom Row: Recent MCP Feedback + Installs & Hardware */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <section className="flex flex-col gap-3.5 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-7 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                      Recent MCP Feedback
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Anonymized capability gaps reported via report_feedback
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavTab("feedback")}
                    className="cursor-pointer text-xs font-medium text-zinc-900 hover:underline dark:text-zinc-200"
                  >
                    View all {data.feedbackTotal} →
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {data.feedback.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      No feedback items submitted yet.
                    </div>
                  ) : (
                    data.feedback.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 dark:border-zinc-800 dark:bg-zinc-950/60"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                            >
                              {item.category}
                            </span>
                            <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {item.clientName}
                              {item.clientVersion ? ` ${item.clientVersion}` : ""}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="text-[13px] font-semibold text-zinc-950 dark:text-zinc-50">
                          {item.goal}
                        </div>
                        <div className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                          {item.limitation}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-5 dark:border-zinc-800 dark:bg-zinc-900">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Installs &amp; Hardware
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Memory, app versions &amp; silicon mix ({data.hardware.totalActive} active)
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                      System RAM (GB)
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                      installs.ram_gb
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {data.hardware.ramBuckets.map((bucket) => (
                      <div
                        key={bucket.label}
                        className="flex flex-col gap-0.5 rounded-[7px] border border-zinc-200 bg-zinc-50 p-2.5 tabular-nums dark:border-zinc-800 dark:bg-zinc-950/60"
                      >
                        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {bucket.label}
                        </span>
                        <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                          {bucket.pct}%
                        </span>
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          {bucket.count} Macs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                    App Version Rollout
                  </span>
                  {data.hardware.versions.length === 0 ? (
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      No installs recorded yet.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {data.hardware.versions.map((v, idx) => (
                        <div
                          key={v.version}
                          className="flex items-center justify-between text-xs tabular-nums"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono ${
                                idx === 0
                                  ? "font-semibold text-zinc-950 dark:text-zinc-50"
                                  : "text-zinc-600 dark:text-zinc-400"
                              }`}
                            >
                              v{v.version}
                            </span>
                            {idx === 0 && (
                              <span className="rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-green-700 dark:border-green-900/70 dark:bg-green-950/60 dark:text-green-400">
                                Top
                              </span>
                            )}
                          </div>
                          <span
                            className={
                              idx === 0
                                ? "font-semibold text-zinc-950 dark:text-zinc-50"
                                : "text-zinc-600 dark:text-zinc-400"
                            }
                          >
                            {v.count} ({v.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">
                    Architecture &amp; macOS
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">aarch64</span>
                      <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {data.hardware.aarch64Pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
                      <span className="font-mono text-zinc-600 dark:text-zinc-400">macOS 15+</span>
                      <span className="font-semibold text-zinc-950 dark:text-zinc-50">
                        {data.hardware.macos15PlusPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Weekly Active Users by Country */}
            <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                    Weekly Active Users by Country
                  </h2>
                  <p className="text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                    Unique installs active in the last 7 days · {data.wauByCountry.totalWau} WAU
                    across {data.wauByCountry.countryCount}{" "}
                    {data.wauByCountry.countryCount === 1 ? "country" : "countries"} (from
                    cf-ipcountry)
                  </p>
                </div>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  Last 7 days
                </span>
              </div>

              {data.wauByCountry.rows.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                  No weekly active users recorded yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-x-7 gap-y-3 md:grid-cols-2">
                  {[countryLeft, countryRight].map((col, colIdx) => (
                    <div key={colIdx} className="flex flex-col gap-3">
                      {col.map((row) => {
                        const deltaText = formatDelta(row.deltaPct);
                        const barWidth = Math.round((row.wau / maxCountryWau) * 100);
                        return (
                          <div key={row.code} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between gap-2 text-[13px]">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
                                  {row.code}
                                </span>
                                <span className="font-medium text-zinc-950 dark:text-zinc-100">
                                  {row.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 tabular-nums">
                                <span
                                  className={`text-xs ${
                                    row.deltaPct !== null && row.deltaPct > 0
                                      ? "text-green-700 dark:text-green-400"
                                      : row.deltaPct !== null && row.deltaPct < 0
                                        ? "text-red-700 dark:text-red-400"
                                        : "text-zinc-400 dark:text-zinc-500"
                                  }`}
                                >
                                  {deltaText ?? "—"}
                                </span>
                                <span className="w-[82px] text-right font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
                                  {row.wau} ({row.pct}%)
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div
                                className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
                                style={{ width: `${Math.min(100, barWidth)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        )}
      </div>
    </div>
  );
}
