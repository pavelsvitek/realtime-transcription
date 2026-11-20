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
      return "bg-red-50 text-red-700 border-red-200";
    case "workflow_friction":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "poor_results":
      return "bg-blue-50 text-blue-700 border-blue-200";
    default:
      return "bg-zinc-100 text-zinc-700 border-zinc-200";
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
    ? "bg-red-50 border-red-200 text-red-700"
    : variant === "blue"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-green-50 border-green-200 text-green-700";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-none tabular-nums ${styles}`}
    >
      {text}
    </span>
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
    <div className="flex min-h-screen w-full bg-zinc-50 text-zinc-950">
      {/* Sidebar */}
      <aside className="hidden w-[240px] shrink-0 flex-col justify-between border-r border-zinc-200 bg-white px-3 py-4 lg:flex">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-zinc-900 text-sm font-bold text-white">
              A
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-4 tracking-[-0.01em] text-zinc-950">
                Amie Telemetry
              </div>
              <div className="truncate text-[11px] leading-3.5 text-zinc-500">
                dashboard.getamie.app
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              Analytics
            </div>
            <button
              type="button"
              onClick={() => setNavTab("overview")}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "overview"
                  ? "bg-zinc-100 font-medium text-zinc-950"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
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
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
              MCP Server
            </div>
            <button
              type="button"
              onClick={() => setNavTab("feedback")}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "feedback"
                  ? "bg-zinc-100 font-medium text-zinc-950"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Feedback Inbox</span>
              </span>
              <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white tabular-nums">
                {data.feedbackTotal}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-600" />
              <span className="text-xs font-medium text-zinc-950">D1 EU Connected</span>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">EEUR</span>
          </div>
          <div className="text-[11px] text-zinc-500">amie-telemetry · Cloudflare Access</div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-7">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-zinc-500">Amie</span>
            <span className="text-zinc-300">/</span>
            <span className="font-semibold text-zinc-950">
              {navTab === "overview" ? "Overview" : "Feedback Inbox"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs">
              <span className="text-zinc-500">Version:</span>
              <select
                value={version}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="cursor-pointer bg-transparent font-medium text-zinc-950 outline-none"
              >
                <option value="all">All versions</option>
                {data.availableVersions.map((v) => (
                  <option key={v} value={v}>
                    v{v}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex h-8 items-center gap-0.5 rounded-[7px] bg-zinc-100 p-[3px]">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleRangeChange(parseRangeDays(String(d)))}
                  className={`h-[26px] cursor-pointer rounded-[5px] px-2.5 text-xs transition-all ${
                    rangeDays === d
                      ? "bg-white font-semibold text-zinc-950 shadow-xs"
                      : "font-medium text-zinc-500 hover:text-zinc-900"
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
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-zinc-50 disabled:opacity-60"
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
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {navTab === "feedback" ? (
          <main className="mx-auto flex w-full max-w-[1160px] flex-col gap-5 px-7 pt-6 pb-10">
            <div className="flex items-end justify-between">
              <div>
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950">
                  MCP Feedback Inbox
                </h1>
                <p className="text-[13px] text-zinc-500">
                  All anonymized capability gaps reported by AI agents via{" "}
                  <code className="font-mono text-xs">report_feedback</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab("overview")}
                className="cursor-pointer rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
              >
                ← Back to Overview
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs">
              {data.feedback.length === 0 ? (
                <div className="py-10 text-center text-sm text-zinc-500">
                  No MCP feedback reports yet.
                </div>
              ) : (
                data.feedback.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                        >
                          {item.category}
                        </span>
                        <span className="rounded border border-zinc-200 bg-white px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-600">
                          {item.clientName}
                          {item.clientVersion ? ` ${item.clientVersion}` : ""}
                        </span>
                        {item.toolsTried.map((tool) => (
                          <span
                            key={tool}
                            className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-zinc-950">{item.goal}</div>
                    <div className="text-xs leading-relaxed text-zinc-600">{item.limitation}</div>
                    {item.suggestedImprovement && (
                      <div className="text-xs text-zinc-500">
                        <span className="font-medium text-zinc-700">Suggested: </span>
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
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-zinc-950">
                  Product Telemetry
                </h1>
                <p className="text-[13px] text-zinc-500">
                  Anonymous desktop app &amp; MCP server metrics · Last {rangeDays} days
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-zinc-900" />
                  Active Installs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-blue-600" />
                  Meetings Recorded
                </span>
              </div>
            </div>

            {/* Primary Metrics Card (KPI Tabs + Chart) */}
            <section className="overflow-hidden rounded-[10px] border border-zinc-200 bg-white shadow-xs">
              <div className="grid grid-cols-1 border-b border-zinc-200 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setChartFocus("overview")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors sm:border-r lg:border-b-0 ${
                    chartFocus === "overview"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b]"
                      : "bg-zinc-50/70 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-600">
                      Active Installs ({rangeDays}d)
                    </span>
                    <DeltaPill delta={data.kpis.activeInstallsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums">
                    {data.kpis.activeInstalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums">
                    DAU {data.kpis.dau} · WAU {data.kpis.wau} · +{data.kpis.newInstalls} new
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("meetings")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors lg:border-r lg:border-b-0 ${
                    chartFocus === "meetings"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b]"
                      : "bg-zinc-50/70 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">Meetings Recorded</span>
                    <DeltaPill delta={data.kpis.meetingsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums">
                    {data.kpis.meetings.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums">
                    {data.kpis.avgMeetingsPerInstall} avg / active install
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("hours")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-zinc-200 p-5 text-left transition-colors sm:border-r sm:border-b-0 ${
                    chartFocus === "hours"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#18181b]"
                      : "bg-zinc-50/70 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">Transcribed Hours</span>
                    <DeltaPill delta={data.kpis.transcribedHoursDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums">
                    {data.kpis.transcribedHours.toLocaleString()}h
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums">
                    {data.kpis.avgMeetingMinutes} min avg duration
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("mcp")}
                  className={`flex cursor-pointer flex-col gap-1.5 p-5 text-left transition-colors ${
                    chartFocus === "mcp"
                      ? "bg-white shadow-[inset_0_-2px_0_0_#2563eb]"
                      : "bg-zinc-50/70 hover:bg-zinc-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">MCP Tool Calls</span>
                    <DeltaPill delta={data.kpis.mcpCallsDeltaPct} variant="blue" />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-zinc-950 tabular-nums">
                    {data.kpis.mcpCalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-zinc-500 tabular-nums">
                    {data.kpis.mcpActiveInstalls} installs · {data.kpis.mcpOkPct}% ok
                  </div>
                </button>
              </div>

              <TimeSeriesChart series={data.dailySeries} focus={chartFocus} />
            </section>

            {/* Middle Row: Feature Adoption + MCP Agents & Tools */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950">Feature Adoption</h2>
                    <p className="text-xs text-zinc-500">
                      Unique active installs using each capability ({rangeDays}d)
                    </p>
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                    By installs
                  </span>
                </div>

                <div className="flex flex-col gap-3.5">
                  {data.features.map((feat) => (
                    <div key={feat.eventKey} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-zinc-950">{feat.label}</span>
                          <span className="hidden font-mono text-[11px] text-zinc-500 sm:inline">
                            {feat.eventKey}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 tabular-nums">
                          <span className="text-xs text-zinc-500">
                            {feat.totalRuns.toLocaleString()}{" "}
                            {feat.eventKey === "mcp_session_started" ? "calls" : "runs"}
                          </span>
                          <span className="w-[82px] text-right font-semibold whitespace-nowrap text-zinc-950">
                            {feat.uniqueInstalls} ({feat.adoptionPct}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={`h-full rounded-full ${
                            feat.accent === "blue" ? "bg-blue-600" : "bg-zinc-900"
                          }`}
                          style={{ width: `${Math.min(100, feat.adoptionPct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950">MCP Agents &amp; Tools</h2>
                    <p className="text-xs text-zinc-500">
                      Connected AI clients &amp; tool call volume
                    </p>
                  </div>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 tabular-nums">
                    {data.kpis.mcpActiveInstalls} active installs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {data.mcpAgents.map((agent) => (
                    <div
                      key={agent.label}
                      className="flex flex-col gap-0.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5"
                    >
                      <span className="text-[11px] text-zinc-500">{agent.label}</span>
                      <span className="text-base font-semibold text-zinc-950 tabular-nums">
                        {agent.pct}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center border-b border-zinc-200 py-1.5 text-[11px] font-medium text-zinc-500">
                    <div className="flex-1">Tool</div>
                    <div className="w-[72px] text-right">Calls</div>
                    <div className="w-[68px] text-right">OK %</div>
                    <div className="w-[64px] text-right">Avg ms</div>
                  </div>
                  {data.mcpTools.length === 0 ? (
                    <div className="py-6 text-center text-xs text-zinc-500">
                      No MCP tool calls recorded in this window.
                    </div>
                  ) : (
                    data.mcpTools.map((tool) => (
                      <div
                        key={tool.tool}
                        className="flex items-center border-b border-zinc-100 py-2 text-xs last:border-b-0 tabular-nums"
                      >
                        <div className="flex-1 truncate font-mono font-medium text-zinc-950">
                          {tool.tool}
                        </div>
                        <div className="w-[72px] text-right font-semibold text-zinc-950">
                          {tool.calls.toLocaleString()}
                        </div>
                        <div
                          className={`w-[68px] text-right ${
                            tool.okPct >= 97 ? "text-green-700" : "text-amber-700"
                          }`}
                        >
                          {tool.okPct}%
                        </div>
                        <div className="w-[64px] text-right text-zinc-500">{tool.avgMs} ms</div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* Bottom Row: Recent MCP Feedback + Installs & Hardware */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <section className="flex flex-col gap-3.5 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-7">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-950">Recent MCP Feedback</h2>
                    <p className="text-xs text-zinc-500">
                      Anonymized capability gaps reported via report_feedback
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavTab("feedback")}
                    className="cursor-pointer text-xs font-medium text-zinc-900 hover:underline"
                  >
                    View all {data.feedbackTotal} →
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {data.feedback.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-zinc-200 py-8 text-center text-xs text-zinc-500">
                      No feedback items submitted yet.
                    </div>
                  ) : (
                    data.feedback.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                            >
                              {item.category}
                            </span>
                            <span className="rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-600">
                              {item.clientName}
                              {item.clientVersion ? ` ${item.clientVersion}` : ""}
                            </span>
                          </div>
                          <span className="text-[11px] text-zinc-500">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="text-[13px] font-semibold text-zinc-950">{item.goal}</div>
                        <div className="text-xs leading-relaxed text-zinc-600">
                          {item.limitation}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-5">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">Installs &amp; Hardware</h2>
                  <p className="text-xs text-zinc-500">
                    Memory, app versions &amp; silicon mix ({data.hardware.totalActive} active)
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-950">System RAM (GB)</span>
                    <span className="font-mono text-[11px] text-zinc-500">installs.ram_gb</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {data.hardware.ramBuckets.map((bucket) => (
                      <div
                        key={bucket.label}
                        className="flex flex-col gap-0.5 rounded-[7px] border border-zinc-200 bg-zinc-50 p-2.5 tabular-nums"
                      >
                        <span className="font-mono text-[11px] text-zinc-500">{bucket.label}</span>
                        <span className="text-base font-semibold text-zinc-950">{bucket.pct}%</span>
                        <span className="text-[11px] text-zinc-500">{bucket.count} Macs</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
                  <span className="text-xs font-semibold text-zinc-950">App Version Rollout</span>
                  {data.hardware.versions.length === 0 ? (
                    <div className="text-xs text-zinc-500">No installs recorded yet.</div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {data.hardware.versions.map((v, idx) => (
                        <div
                          key={v.version}
                          className="flex items-center justify-between text-xs tabular-nums"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono ${idx === 0 ? "font-semibold text-zinc-950" : "text-zinc-600"}`}
                            >
                              v{v.version}
                            </span>
                            {idx === 0 && (
                              <span className="rounded-full border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-green-700">
                                Top
                              </span>
                            )}
                          </div>
                          <span className={idx === 0 ? "font-semibold text-zinc-950" : "text-zinc-600"}>
                            {v.count} ({v.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
                  <span className="text-xs font-semibold text-zinc-950">Architecture &amp; macOS</span>
                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                      <span className="font-mono text-zinc-600">aarch64</span>
                      <span className="font-semibold text-zinc-950">{data.hardware.aarch64Pct}%</span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-2">
                      <span className="font-mono text-zinc-600">macOS 15+</span>
                      <span className="font-semibold text-zinc-950">
                        {data.hardware.macos15PlusPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Weekly Active Users by Country */}
            <section className="flex flex-col gap-4 rounded-[10px] border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-950">
                    Weekly Active Users by Country
                  </h2>
                  <p className="text-xs text-zinc-500 tabular-nums">
                    Unique installs active in the last 7 days · {data.wauByCountry.totalWau} WAU
                    across {data.wauByCountry.countryCount}{" "}
                    {data.wauByCountry.countryCount === 1 ? "country" : "countries"} (from
                    cf-ipcountry)
                  </p>
                </div>
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                  Last 7 days
                </span>
              </div>

              {data.wauByCountry.rows.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500">
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
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-900">
                                  {row.code}
                                </span>
                                <span className="font-medium text-zinc-950">{row.label}</span>
                              </div>
                              <div className="flex items-center gap-2.5 tabular-nums">
                                <span
                                  className={`text-xs ${
                                    row.deltaPct !== null && row.deltaPct > 0
                                      ? "text-green-700"
                                      : row.deltaPct !== null && row.deltaPct < 0
                                        ? "text-red-700"
                                        : "text-zinc-400"
                                  }`}
                                >
                                  {deltaText ?? "—"}
                                </span>
                                <span className="w-[82px] text-right font-semibold whitespace-nowrap text-zinc-950">
                                  {row.wau} ({row.pct}%)
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                              <div
                                className="h-full rounded-full bg-zinc-900"
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
