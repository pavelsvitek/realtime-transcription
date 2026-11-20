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
      return "bg-danger-bg text-danger-fg border-danger-border";
    case "workflow_friction":
      return "bg-warning-bg text-warning-fg border-warning-border";
    case "poor_results":
      return "bg-info-bg text-info-fg border-info-border";
    default:
      return "bg-muted text-secondary-foreground border-border";
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
    ? "bg-danger-bg border-danger-border text-danger-fg"
    : variant === "blue"
      ? "bg-info-bg border-info-border text-info-fg"
      : "bg-positive-bg border-positive-border text-positive-fg";

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
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
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
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden w-[240px] shrink-0 flex-col justify-between border-r border-border bg-card px-3 py-4 lg:flex">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-primary text-sm font-bold text-primary-foreground">
              A
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold leading-4 tracking-[-0.01em] text-foreground">
                Amie Telemetry
              </div>
              <div className="truncate text-[11px] leading-3.5 text-muted-foreground">
                dashboard.getamie.app
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              Analytics
            </div>
            <button
              type="button"
              onClick={() => setNavTab("overview")}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "overview"
                  ? "bg-muted font-medium text-foreground"
                  : "text-secondary-foreground hover:bg-muted/60 hover:text-foreground"
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
            <div className="px-2.5 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
              MCP Server
            </div>
            <button
              type="button"
              onClick={() => setNavTab("feedback")}
              className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                navTab === "feedback"
                  ? "bg-muted font-medium text-foreground"
                  : "text-secondary-foreground hover:bg-muted/60 hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Feedback Inbox</span>
              </span>
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground tabular-nums">
                {data.feedbackTotal}
              </span>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary p-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-positive-fg" />
              <span className="text-xs font-medium text-foreground">D1 EU Connected</span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">EEUR</span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            amie-telemetry · Cloudflare Access
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-7">
          <div className="flex items-center gap-2 text-[13px]">
            <span className="font-medium text-muted-foreground">Amie</span>
            <span className="text-border">/</span>
            <span className="font-semibold text-foreground">
              {navTab === "overview" ? "Overview" : "Feedback Inbox"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs">
              <span className="text-muted-foreground">Version:</span>
              <select
                value={version}
                onChange={(e) => handleVersionChange(e.target.value)}
                className="cursor-pointer bg-transparent font-medium text-foreground outline-none"
              >
                <option value="all" className="bg-card text-foreground">
                  All versions
                </option>
                {data.availableVersions.map((v) => (
                  <option key={v} value={v} className="bg-card text-foreground">
                    v{v}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex h-8 items-center gap-0.5 rounded-[7px] bg-muted p-[3px]">
              {([7, 30, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleRangeChange(parseRangeDays(String(d)))}
                  className={`h-[26px] cursor-pointer rounded-[5px] px-2.5 text-xs transition-all ${
                    rangeDays === d
                      ? "bg-card font-semibold text-foreground shadow-xs"
                      : "font-medium text-muted-foreground hover:text-foreground"
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
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
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
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  MCP Feedback Inbox
                </h1>
                <p className="text-[13px] text-muted-foreground">
                  All anonymized capability gaps reported by AI agents via{" "}
                  <code className="font-mono text-xs">report_feedback</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNavTab("overview")}
                className="cursor-pointer rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                ← Back to Overview
              </button>
            </div>

            <div className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-5 shadow-xs">
              {data.feedback.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No MCP feedback reports yet.
                </div>
              ) : (
                data.feedback.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-secondary p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                        >
                          {item.category}
                        </span>
                        <span className="rounded border border-border bg-card px-2 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground">
                          {item.clientName}
                          {item.clientVersion ? ` ${item.clientVersion}` : ""}
                        </span>
                        {item.toolsTried.map((tool) => (
                          <span
                            key={tool}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-secondary-foreground"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <div className="text-[13px] font-semibold text-foreground">{item.goal}</div>
                    <div className="text-xs leading-relaxed text-secondary-foreground">
                      {item.limitation}
                    </div>
                    {item.suggestedImprovement && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Suggested: </span>
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
                <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">
                  Product Telemetry
                </h1>
                <p className="text-[13px] text-muted-foreground">
                  Anonymous desktop app &amp; MCP server metrics · Last {rangeDays} days
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-primary" />
                  Active Installs
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-[2px] bg-accent-blue" />
                  Meetings Recorded
                </span>
              </div>
            </div>

            {/* Primary Metrics Card (KPI Tabs + Chart) */}
            <section className="overflow-hidden rounded-[10px] border border-border bg-card shadow-xs">
              <div className="grid grid-cols-1 border-b border-border sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setChartFocus("overview")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-border p-5 text-left transition-colors sm:border-r lg:border-b-0 ${
                    chartFocus === "overview"
                      ? "bg-card shadow-[inset_0_-2px_0_0_var(--primary)]"
                      : "bg-secondary hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Active Installs ({rangeDays}d)
                    </span>
                    <DeltaPill delta={data.kpis.activeInstallsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-foreground tabular-nums">
                    {data.kpis.activeInstalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    DAU {data.kpis.dau} · WAU {data.kpis.wau} · +{data.kpis.newInstalls} new
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("meetings")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-border p-5 text-left transition-colors lg:border-r lg:border-b-0 ${
                    chartFocus === "meetings"
                      ? "bg-card shadow-[inset_0_-2px_0_0_var(--primary)]"
                      : "bg-secondary hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Meetings Recorded
                    </span>
                    <DeltaPill delta={data.kpis.meetingsDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-foreground tabular-nums">
                    {data.kpis.meetings.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {data.kpis.avgMeetingsPerInstall} avg / active install
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("hours")}
                  className={`flex cursor-pointer flex-col gap-1.5 border-b border-border p-5 text-left transition-colors sm:border-r sm:border-b-0 ${
                    chartFocus === "hours"
                      ? "bg-card shadow-[inset_0_-2px_0_0_var(--primary)]"
                      : "bg-secondary hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Transcribed Hours
                    </span>
                    <DeltaPill delta={data.kpis.transcribedHoursDeltaPct} />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-foreground tabular-nums">
                    {data.kpis.transcribedHours.toLocaleString()}h
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {data.kpis.avgMeetingMinutes} min avg duration
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setChartFocus("mcp")}
                  className={`flex cursor-pointer flex-col gap-1.5 p-5 text-left transition-colors ${
                    chartFocus === "mcp"
                      ? "bg-card shadow-[inset_0_-2px_0_0_var(--accent-blue)]"
                      : "bg-secondary hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      MCP Tool Calls
                    </span>
                    <DeltaPill delta={data.kpis.mcpCallsDeltaPct} variant="blue" />
                  </div>
                  <div className="text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-foreground tabular-nums">
                    {data.kpis.mcpCalls.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {data.kpis.mcpActiveInstalls} installs · {data.kpis.mcpOkPct}% ok
                  </div>
                </button>
              </div>

              <TimeSeriesChart series={data.dailySeries} focus={chartFocus} />
            </section>

            {/* Middle Row: Feature Adoption + MCP Agents & Tools */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Feature Adoption</h2>
                    <p className="text-xs text-muted-foreground">
                      Unique active installs using each capability ({rangeDays}d)
                    </p>
                  </div>
                  <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    By installs
                  </span>
                </div>

                <div className="flex flex-col gap-3.5">
                  {data.features.map((feat) => (
                    <div key={feat.eventKey} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2 text-[13px]">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-foreground">{feat.label}</span>
                          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                            {feat.eventKey}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 tabular-nums">
                          <span className="text-xs text-muted-foreground">
                            {feat.totalRuns.toLocaleString()}{" "}
                            {feat.eventKey === "mcp_session_started" ? "calls" : "runs"}
                          </span>
                          <span className="w-[82px] text-right font-semibold whitespace-nowrap text-foreground">
                            {feat.uniqueInstalls} ({feat.adoptionPct}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            feat.accent === "blue" ? "bg-accent-blue" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, feat.adoptionPct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      MCP Agents &amp; Tools
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Connected AI clients &amp; tool call volume
                    </p>
                  </div>
                  <span className="rounded-md border border-info-border bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-fg tabular-nums">
                    {data.kpis.mcpActiveInstalls} active installs
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {data.mcpAgents.map((agent) => (
                    <div
                      key={agent.label}
                      className="flex flex-col gap-0.5 rounded-lg border border-border bg-secondary px-3 py-2.5"
                    >
                      <span className="text-[11px] text-muted-foreground">{agent.label}</span>
                      <span className="text-base font-semibold text-foreground tabular-nums">
                        {agent.pct}%
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col">
                  <div className="flex items-center border-b border-border py-1.5 text-[11px] font-medium text-muted-foreground">
                    <div className="flex-1">Tool</div>
                    <div className="w-[72px] text-right">Calls</div>
                    <div className="w-[68px] text-right">OK %</div>
                    <div className="w-[64px] text-right">Avg ms</div>
                  </div>
                  {data.mcpTools.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No MCP tool calls recorded in this window.
                    </div>
                  ) : (
                    data.mcpTools.map((tool) => (
                      <div
                        key={tool.tool}
                        className="flex items-center border-b border-border-subtle py-2 text-xs last:border-b-0 tabular-nums"
                      >
                        <div className="flex-1 truncate font-mono font-medium text-foreground">
                          {tool.tool}
                        </div>
                        <div className="w-[72px] text-right font-semibold text-foreground">
                          {tool.calls.toLocaleString()}
                        </div>
                        <div
                          className={`w-[68px] text-right ${
                            tool.okPct >= 97 ? "text-positive-fg" : "text-warning-fg"
                          }`}
                        >
                          {tool.okPct}%
                        </div>
                        <div className="w-[64px] text-right text-muted-foreground">
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
              <section className="flex flex-col gap-3.5 rounded-[10px] border border-border bg-card p-5 shadow-xs lg:col-span-7">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">Recent MCP Feedback</h2>
                    <p className="text-xs text-muted-foreground">
                      Anonymized capability gaps reported via report_feedback
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavTab("feedback")}
                    className="cursor-pointer text-xs font-medium text-foreground hover:underline"
                  >
                    View all {data.feedbackTotal} →
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {data.feedback.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                      No feedback items submitted yet.
                    </div>
                  ) : (
                    data.feedback.slice(0, 3).map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-col gap-1.5 rounded-lg border border-border bg-secondary px-3.5 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${categoryBadgeClass(item.category)}`}
                            >
                              {item.category}
                            </span>
                            <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary-foreground">
                              {item.clientName}
                              {item.clientVersion ? ` ${item.clientVersion}` : ""}
                            </span>
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="text-[13px] font-semibold text-foreground">{item.goal}</div>
                        <div className="text-xs leading-relaxed text-secondary-foreground">
                          {item.limitation}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5 shadow-xs lg:col-span-5">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Installs &amp; Hardware</h2>
                  <p className="text-xs text-muted-foreground">
                    Memory, app versions &amp; silicon mix ({data.hardware.totalActive} active)
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">System RAM (GB)</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      installs.ram_gb
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {data.hardware.ramBuckets.map((bucket) => (
                      <div
                        key={bucket.label}
                        className="flex flex-col gap-0.5 rounded-[7px] border border-border bg-secondary p-2.5 tabular-nums"
                      >
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {bucket.label}
                        </span>
                        <span className="text-base font-semibold text-foreground">
                          {bucket.pct}%
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {bucket.count} Macs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                  <span className="text-xs font-semibold text-foreground">App Version Rollout</span>
                  {data.hardware.versions.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No installs recorded yet.</div>
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
                                  ? "font-semibold text-foreground"
                                  : "text-secondary-foreground"
                              }`}
                            >
                              v{v.version}
                            </span>
                            {idx === 0 && (
                              <span className="rounded-full border border-positive-border bg-positive-bg px-1.5 py-0.5 text-[10px] font-semibold leading-none text-positive-fg">
                                Top
                              </span>
                            )}
                          </div>
                          <span
                            className={
                              idx === 0
                                ? "font-semibold text-foreground"
                                : "text-secondary-foreground"
                            }
                          >
                            {v.count} ({v.pct}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-border-subtle pt-3">
                  <span className="text-xs font-semibold text-foreground">
                    Architecture &amp; macOS
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div className="flex items-center justify-between rounded-md border border-border bg-secondary px-2.5 py-2">
                      <span className="font-mono text-secondary-foreground">aarch64</span>
                      <span className="font-semibold text-foreground">
                        {data.hardware.aarch64Pct}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-border bg-secondary px-2.5 py-2">
                      <span className="font-mono text-secondary-foreground">macOS 15+</span>
                      <span className="font-semibold text-foreground">
                        {data.hardware.macos15PlusPct}%
                      </span>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Weekly Active Users by Country */}
            <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-5 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Weekly Active Users by Country
                  </h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Unique installs active in the last 7 days · {data.wauByCountry.totalWau} WAU
                    across {data.wauByCountry.countryCount}{" "}
                    {data.wauByCountry.countryCount === 1 ? "country" : "countries"} (from
                    cf-ipcountry)
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                  Last 7 days
                </span>
              </div>

              {data.wauByCountry.rows.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
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
                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                                  {row.code}
                                </span>
                                <span className="font-medium text-foreground">{row.label}</span>
                              </div>
                              <div className="flex items-center gap-2.5 tabular-nums">
                                <span
                                  className={`text-xs ${
                                    row.deltaPct !== null && row.deltaPct > 0
                                      ? "text-positive-fg"
                                      : row.deltaPct !== null && row.deltaPct < 0
                                        ? "text-danger-fg"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {deltaText ?? "—"}
                                </span>
                                <span className="w-[82px] text-right font-semibold whitespace-nowrap text-foreground">
                                  {row.wau} ({row.pct}%)
                                </span>
                              </div>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
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
