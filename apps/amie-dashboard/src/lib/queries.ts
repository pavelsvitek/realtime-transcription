export type DateRangeDays = 7 | 30 | 90;

export interface DashboardMetrics {
  rangeDays: DateRangeDays;
  versionFilter: string;
  generatedAt: number;
  availableVersions: string[];
  kpis: {
    activeInstalls: number;
    activeInstallsDeltaPct: number | null;
    dau: number;
    wau: number;
    newInstalls: number;
    meetings: number;
    meetingsDeltaPct: number | null;
    avgMeetingsPerInstall: number;
    transcribedHours: number;
    transcribedHoursDeltaPct: number | null;
    avgMeetingMinutes: number;
    mcpCalls: number;
    mcpCallsDeltaPct: number | null;
    mcpActiveInstalls: number;
    mcpOkPct: number;
  };
  dailySeries: Array<{
    date: string; // YYYY-MM-DD
    activeInstalls: number;
    meetings: number;
    mcpCalls: number;
  }>;
  features: Array<{
    label: string;
    eventKey: string;
    uniqueInstalls: number;
    adoptionPct: number;
    totalRuns: number;
    accent?: "blue";
  }>;
  mcpAgents: Array<{
    label: string;
    installs: number;
    pct: number;
  }>;
  mcpTools: Array<{
    tool: string;
    calls: number;
    okPct: number;
    avgMs: number;
  }>;
  feedbackTotal: number;
  feedback: Array<{
    id: number;
    createdAt: number;
    category: string;
    clientName: string;
    clientVersion: string | null;
    goal: string;
    limitation: string;
    suggestedImprovement: string | null;
    toolsTried: string[];
  }>;
  hardware: {
    totalActive: number;
    ramBuckets: Array<{
      label: string;
      count: number;
      pct: number;
    }>;
    versions: Array<{
      version: string;
      count: number;
      pct: number;
    }>;
    aarch64Pct: number;
    macos15PlusPct: number;
  };
  wauByCountry: {
    totalWau: number;
    countryCount: number;
    rows: Array<{
      code: string;
      label: string;
      wau: number;
      pct: number;
      deltaPct: number | null;
    }>;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseRangeDays(raw: string | null | undefined): DateRangeDays {
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function pctShare(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function formatDayUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function classifyAgent(raw: string | null): string {
  const lower = (raw ?? "").toLowerCase();
  if (lower.includes("claude-code") || lower.includes("claude code")) return "Claude Code";
  if (lower.includes("cursor")) return "Cursor";
  if (lower.includes("codex")) return "Codex";
  if (lower.includes("claude")) return "Claude Desktop";
  return "Other";
}

function safeParseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function queryDashboardMetrics(
  db: D1Database,
  rangeDays: DateRangeDays,
  versionFilter: string,
  now: number = Date.now(),
): Promise<DashboardMetrics> {
  const since = now - rangeDays * DAY_MS;
  const prevSince = since - rangeDays * DAY_MS;
  const dauSince = now - DAY_MS;
  const wauSince = now - 7 * DAY_MS;
  const prevWauSince = wauSince - 7 * DAY_MS;
  const hasVersion = versionFilter !== "all" && versionFilter.trim().length > 0;
  const versionClause = hasVersion ? " AND app_version = ? " : "";

  const bindRange = (start: number, end: number) =>
    hasVersion ? [start, end, versionFilter] : [start, end];

  const [
    versionsListRes,
    activeCurRes,
    activePrevRes,
    dauRes,
    wauRes,
    newInstallsRes,
    meetingsCurRes,
    meetingsPrevRes,
    mcpCurRes,
    mcpPrevRes,
    dailyRes,
    featureEventsRes,
    followUpRes,
    mcpAgentsRes,
    mcpToolsRes,
    feedbackCountRes,
    feedbackRowsRes,
    activeInstallsMetaRes,
    wauCountryCurRes,
    wauCountryPrevRes,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT app_version, COUNT(*) AS cnt
         FROM installs
         GROUP BY app_version
         ORDER BY cnt DESC, app_version DESC
         LIMIT 20`,
      )
      .all<{ app_version: string; cnt: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT install_id) AS cnt
         FROM events
         WHERE created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(since, now + 1))
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT install_id) AS cnt
         FROM events
         WHERE created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(prevSince, since))
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT install_id) AS cnt
         FROM events
         WHERE created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(dauSince, now + 1))
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT COUNT(DISTINCT install_id) AS cnt
         FROM events
         WHERE created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(wauSince, now + 1))
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM installs
         WHERE first_seen_at >= ? AND first_seen_at < ?${versionClause}`,
      )
      .bind(...bindRange(since, now + 1))
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT
           COUNT(*) AS cnt,
           COALESCE(SUM(CAST(json_extract(properties, '$.duration_sec') AS REAL)), 0) AS total_sec
         FROM events
         WHERE event_name = 'meeting_ended'
           AND created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(since, now + 1))
      .first<{ cnt: number; total_sec: number }>(),

    db
      .prepare(
        `SELECT
           COUNT(*) AS cnt,
           COALESCE(SUM(CAST(json_extract(properties, '$.duration_sec') AS REAL)), 0) AS total_sec
         FROM events
         WHERE event_name = 'meeting_ended'
           AND created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(prevSince, since))
      .first<{ cnt: number; total_sec: number }>(),

    db
      .prepare(
        `SELECT
           COUNT(*) AS calls,
           COUNT(DISTINCT install_id) AS installs,
           SUM(CASE WHEN json_extract(properties, '$.ok') = 1 THEN 1 ELSE 0 END) AS ok_calls
         FROM events
         WHERE event_name = 'mcp_tool_called'
           AND created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(since, now + 1))
      .first<{ calls: number; installs: number; ok_calls: number | null }>(),

    db
      .prepare(
        `SELECT COUNT(*) AS calls
         FROM events
         WHERE event_name = 'mcp_tool_called'
           AND created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(prevSince, since))
      .first<{ calls: number }>(),

    db
      .prepare(
        `SELECT
           strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
           COUNT(DISTINCT install_id) AS active_installs,
           SUM(CASE WHEN event_name = 'meeting_ended' THEN 1 ELSE 0 END) AS meetings,
           SUM(CASE WHEN event_name = 'mcp_tool_called' THEN 1 ELSE 0 END) AS mcp_calls
         FROM events
         WHERE created_at >= ? AND created_at < ?${versionClause}
         GROUP BY day
         ORDER BY day ASC`,
      )
      .bind(...bindRange(since, now + 1))
      .all<{ day: string; active_installs: number; meetings: number; mcp_calls: number }>(),

    db
      .prepare(
        `SELECT
           event_name,
           COUNT(DISTINCT install_id) AS installs,
           COUNT(*) AS runs
         FROM events
         WHERE event_name IN ('meeting_ended', 'summary_generated', 'transcript_exported', 'mcp_session_started')
           AND created_at >= ? AND created_at < ?${versionClause}
         GROUP BY event_name`,
      )
      .bind(...bindRange(since, now + 1))
      .all<{ event_name: string; installs: number; runs: number }>(),

    db
      .prepare(
        `SELECT
           COUNT(DISTINCT install_id) AS installs,
           COUNT(*) AS runs
         FROM events
         WHERE event_name = 'feature_used'
           AND json_extract(properties, '$.feature') = 'follow_up_meeting'
           AND created_at >= ? AND created_at < ?${versionClause}`,
      )
      .bind(...bindRange(since, now + 1))
      .first<{ installs: number; runs: number }>(),

    db
      .prepare(
        `SELECT
           json_extract(properties, '$.client_name') AS client_name,
           COUNT(DISTINCT install_id) AS installs
         FROM events
         WHERE event_name IN ('mcp_session_started', 'mcp_tool_called')
           AND created_at >= ? AND created_at < ?${versionClause}
         GROUP BY client_name`,
      )
      .bind(...bindRange(since, now + 1))
      .all<{ client_name: string | null; installs: number }>(),

    db
      .prepare(
        `SELECT
           json_extract(properties, '$.tool') AS tool,
           COUNT(*) AS calls,
           SUM(CASE WHEN json_extract(properties, '$.ok') = 1 THEN 1 ELSE 0 END) AS ok_calls,
           AVG(CAST(json_extract(properties, '$.duration_ms') AS REAL)) AS avg_ms
         FROM events
         WHERE event_name = 'mcp_tool_called'
           AND created_at >= ? AND created_at < ?${versionClause}
         GROUP BY tool
         ORDER BY calls DESC
         LIMIT 6`,
      )
      .bind(...bindRange(since, now + 1))
      .all<{ tool: string | null; calls: number; ok_calls: number | null; avg_ms: number | null }>(),

    db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM events
         WHERE event_name = 'mcp_feedback_reported'`,
      )
      .first<{ cnt: number }>(),

    db
      .prepare(
        `SELECT id, created_at, properties
         FROM events
         WHERE event_name = 'mcp_feedback_reported'
         ORDER BY created_at DESC
         LIMIT 25`,
      )
      .all<{ id: number; created_at: number; properties: string | null }>(),

    db
      .prepare(
        `SELECT app_version, os_version, arch, ram_gb
         FROM installs
         WHERE last_seen_at >= ?${hasVersion ? " AND app_version = ?" : ""}`,
      )
      .bind(...(hasVersion ? [since, versionFilter] : [since]))
      .all<{
        app_version: string;
        os_version: string | null;
        arch: string | null;
        ram_gb: number | null;
      }>(),

    db
      .prepare(
        `SELECT
           COALESCE(i.country, 'Unknown') AS country,
           COUNT(DISTINCT e.install_id) AS wau
         FROM events e
         LEFT JOIN installs i ON i.install_id = e.install_id
         WHERE e.created_at >= ? AND e.created_at < ?${hasVersion ? " AND e.app_version = ?" : ""}
         GROUP BY country
         ORDER BY wau DESC`,
      )
      .bind(...bindRange(wauSince, now + 1))
      .all<{ country: string; wau: number }>(),

    db
      .prepare(
        `SELECT
           COALESCE(i.country, 'Unknown') AS country,
           COUNT(DISTINCT e.install_id) AS wau
         FROM events e
         LEFT JOIN installs i ON i.install_id = e.install_id
         WHERE e.created_at >= ? AND e.created_at < ?${hasVersion ? " AND e.app_version = ?" : ""}
         GROUP BY country`,
      )
      .bind(...bindRange(prevWauSince, wauSince))
      .all<{ country: string; wau: number }>(),
  ]);

  const activeInstalls = activeCurRes?.cnt ?? 0;
  const prevActiveInstalls = activePrevRes?.cnt ?? 0;
  const meetings = meetingsCurRes?.cnt ?? 0;
  const prevMeetings = meetingsPrevRes?.cnt ?? 0;
  const totalSec = meetingsCurRes?.total_sec ?? 0;
  const prevTotalSec = meetingsPrevRes?.total_sec ?? 0;
  const transcribedHours = Math.round((totalSec / 3600) * 10) / 10;
  const prevTranscribedHours = prevTotalSec / 3600;
  const mcpCalls = mcpCurRes?.calls ?? 0;
  const mcpOkCalls = mcpCurRes?.ok_calls ?? 0;

  // Build continuous daily time series
  const dailyMap = new Map(
    (dailyRes.results ?? []).map((row) => [row.day, row]),
  );
  const dailySeries: DashboardMetrics["dailySeries"] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const day = formatDayUtc(now - i * DAY_MS);
    const row = dailyMap.get(day);
    dailySeries.push({
      date: day,
      activeInstalls: row?.active_installs ?? 0,
      meetings: row?.meetings ?? 0,
      mcpCalls: row?.mcp_calls ?? 0,
    });
  }

  // Feature adoption rows
  const featMap = new Map(
    (featureEventsRes.results ?? []).map((r) => [r.event_name, r]),
  );
  const features: DashboardMetrics["features"] = [
    {
      label: "Local Transcription",
      eventKey: "meeting_ended",
      uniqueInstalls: featMap.get("meeting_ended")?.installs ?? 0,
      adoptionPct: pctShare(featMap.get("meeting_ended")?.installs ?? 0, activeInstalls),
      totalRuns: featMap.get("meeting_ended")?.runs ?? 0,
    },
    {
      label: "AI Meeting Summaries",
      eventKey: "summary_generated",
      uniqueInstalls: featMap.get("summary_generated")?.installs ?? 0,
      adoptionPct: pctShare(featMap.get("summary_generated")?.installs ?? 0, activeInstalls),
      totalRuns: featMap.get("summary_generated")?.runs ?? 0,
    },
    {
      label: "Transcript Export",
      eventKey: "transcript_exported",
      uniqueInstalls: featMap.get("transcript_exported")?.installs ?? 0,
      adoptionPct: pctShare(featMap.get("transcript_exported")?.installs ?? 0, activeInstalls),
      totalRuns: featMap.get("transcript_exported")?.runs ?? 0,
    },
    {
      label: "Follow-up Meetings",
      eventKey: "follow_up_meeting",
      uniqueInstalls: followUpRes?.installs ?? 0,
      adoptionPct: pctShare(followUpRes?.installs ?? 0, activeInstalls),
      totalRuns: followUpRes?.runs ?? 0,
    },
    {
      label: "Local MCP Connected",
      eventKey: "mcp_session_started",
      uniqueInstalls: featMap.get("mcp_session_started")?.installs ?? 0,
      adoptionPct: pctShare(featMap.get("mcp_session_started")?.installs ?? 0, activeInstalls),
      totalRuns: mcpCalls,
      accent: "blue",
    },
  ];

  // MCP agents grouped cleanly
  const agentCounts = new Map<string, number>([
    ["Claude Code", 0],
    ["Cursor", 0],
    ["Codex", 0],
    ["Other", 0],
  ]);
  let totalAgentInstalls = 0;
  for (const row of mcpAgentsRes.results ?? []) {
    const bucket = classifyAgent(row.client_name);
    const key = agentCounts.has(bucket) ? bucket : "Other";
    agentCounts.set(key, (agentCounts.get(key) ?? 0) + row.installs);
    totalAgentInstalls += row.installs;
  }
  const mcpAgents = Array.from(agentCounts.entries()).map(([label, installs]) => ({
    label,
    installs,
    pct: pctShare(installs, totalAgentInstalls),
  }));

  const mcpTools = (mcpToolsRes.results ?? [])
    .filter((r) => Boolean(r.tool))
    .map((r) => ({
      tool: r.tool ?? "unknown",
      calls: r.calls,
      okPct: r.calls > 0 ? Math.round(((r.ok_calls ?? 0) / r.calls) * 1000) / 10 : 0,
      avgMs: Math.round(r.avg_ms ?? 0),
    }));

  // Feedback inbox
  const feedback = (feedbackRowsRes.results ?? []).map((row) => {
    const props = safeParseJson(row.properties);
    const toolsRaw = Array.isArray(props.tools_tried) ? props.tools_tried : [];
    return {
      id: row.id,
      createdAt: row.created_at,
      category: typeof props.category === "string" ? props.category : "other",
      clientName: typeof props.client_name === "string" ? props.client_name : "unknown",
      clientVersion: typeof props.client_version === "string" ? props.client_version : null,
      goal: typeof props.goal === "string" ? props.goal : "(no goal)",
      limitation: typeof props.limitation === "string" ? props.limitation : "",
      suggestedImprovement:
        typeof props.suggested_improvement === "string" ? props.suggested_improvement : null,
      toolsTried: toolsRaw.filter((t): t is string => typeof t === "string"),
    };
  });

  // Hardware & Versions
  const hwRows = activeInstallsMetaRes.results ?? [];
  const totalHw = hwRows.length;
  let ram8 = 0;
  let ram16 = 0;
  let ram24to36 = 0;
  let ram48Plus = 0;
  let aarch64Count = 0;
  let macos15PlusCount = 0;
  const versionCounts = new Map<string, number>();

  for (const row of hwRows) {
    versionCounts.set(row.app_version, (versionCounts.get(row.app_version) ?? 0) + 1);
    if (row.arch === "aarch64" || row.arch === "arm64") aarch64Count++;
    const osMatch = row.os_version?.match(/(\d+)/);
    if (osMatch && Number(osMatch[1]) >= 15) macos15PlusCount++;
    if (typeof row.ram_gb === "number") {
      if (row.ram_gb <= 8) ram8++;
      else if (row.ram_gb <= 16) ram16++;
      else if (row.ram_gb <= 36) ram24to36++;
      else ram48Plus++;
    }
  }

  const ramTotal = ram8 + ram16 + ram24to36 + ram48Plus;
  const ramBuckets = [
    { label: "16 GB", count: ram16, pct: pctShare(ram16, ramTotal) },
    { label: "24–36 GB", count: ram24to36, pct: pctShare(ram24to36, ramTotal) },
    { label: "48+ GB", count: ram48Plus, pct: pctShare(ram48Plus, ramTotal) },
    { label: "8 GB", count: ram8, pct: pctShare(ram8, ramTotal) },
  ];

  const versions = Array.from(versionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([version, count]) => ({
      version,
      count,
      pct: pctShare(count, totalHw),
    }));

  // WAU by Country
  const prevCountryMap = new Map(
    (wauCountryPrevRes.results ?? []).map((r) => [r.country, r.wau]),
  );
  const countryRowsRaw = wauCountryCurRes.results ?? [];
  const totalWau = wauRes?.cnt ?? 0;
  const regionNames =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function"
      ? new Intl.DisplayNames(["en"], { type: "region" })
      : null;

  const countryDisplay = (code: string): string => {
    if (!/^[A-Z]{2}$/.test(code)) return "Unknown";
    try {
      return regionNames?.of(code) ?? code;
    } catch {
      return code;
    }
  };

  const topCountries = countryRowsRaw.slice(0, 5).map((r) => ({
    code: r.country,
    label: countryDisplay(r.country),
    wau: r.wau,
    pct: pctShare(r.wau, totalWau),
    deltaPct: pctDelta(r.wau, prevCountryMap.get(r.country) ?? 0),
  }));

  if (countryRowsRaw.length > 5) {
    const rest = countryRowsRaw.slice(5);
    const otherWau = rest.reduce((sum, r) => sum + r.wau, 0);
    topCountries.push({
      code: `+${rest.length}`,
      label: "Other countries",
      wau: otherWau,
      pct: pctShare(otherWau, totalWau),
      deltaPct: null,
    });
  }

  return {
    rangeDays,
    versionFilter: hasVersion ? versionFilter : "all",
    generatedAt: now,
    availableVersions: (versionsListRes.results ?? []).map((r) => r.app_version),
    kpis: {
      activeInstalls,
      activeInstallsDeltaPct: pctDelta(activeInstalls, prevActiveInstalls),
      dau: dauRes?.cnt ?? 0,
      wau: totalWau,
      newInstalls: newInstallsRes?.cnt ?? 0,
      meetings,
      meetingsDeltaPct: pctDelta(meetings, prevMeetings),
      avgMeetingsPerInstall:
        activeInstalls > 0 ? Math.round((meetings / activeInstalls) * 10) / 10 : 0,
      transcribedHours,
      transcribedHoursDeltaPct: pctDelta(transcribedHours, prevTranscribedHours),
      avgMeetingMinutes: meetings > 0 ? Math.round((totalSec / meetings / 60) * 10) / 10 : 0,
      mcpCalls,
      mcpCallsDeltaPct: pctDelta(mcpCalls, mcpPrevRes?.calls ?? 0),
      mcpActiveInstalls: mcpCurRes?.installs ?? 0,
      mcpOkPct: mcpCalls > 0 ? Math.round((mcpOkCalls / mcpCalls) * 1000) / 10 : 100,
    },
    dailySeries,
    features,
    mcpAgents,
    mcpTools,
    feedbackTotal: feedbackCountRes?.cnt ?? 0,
    feedback,
    hardware: {
      totalActive: totalHw,
      ramBuckets,
      versions,
      aarch64Pct: pctShare(aarch64Count, totalHw),
      macos15PlusPct: pctShare(macos15PlusCount, totalHw),
    },
    wauByCountry: {
      totalWau,
      countryCount: countryRowsRaw.filter((r) => r.country !== "Unknown").length,
      rows: topCountries,
    },
  };
}
