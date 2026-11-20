export const MAX_PAYLOAD_BYTES = 32 * 1024;
export const MAX_EVENTS_PER_BATCH = 50;
export const MAX_PROPS_BYTES = 4 * 1024;

const ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;
const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_PAST_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for offline-buffered events
const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes clock-skew tolerance

export interface NormalizedEvent {
  name: string;
  ts: number;
  properties: string | null;
}

export interface NormalizedTelemetryBatch {
  installId: string;
  sessionId: string;
  appVersion: string;
  osVersion: string | null;
  arch: string | null;
  ramGb: number | null;
  country: string | null;
  receivedAt: number;
  events: NormalizedEvent[];
}

export type ValidationResult =
  | { ok: true; data: NormalizedTelemetryBatch }
  | { ok: false; error: string };

function trimString(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function normalizeRamGb(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return "invalid";
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 4096) return "invalid";
  return rounded;
}

function clampTimestamp(value: unknown, now: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return now;
  const rounded = Math.round(value);
  if (rounded < now - MAX_PAST_MS || rounded > now + MAX_FUTURE_MS) return now;
  return rounded;
}

function normalizeCountry(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const code = headerValue.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === "XX") return null;
  return code;
}

export function validateTelemetryPayload(
  raw: unknown,
  countryHeader: string | null,
  now: number = Date.now(),
): ValidationResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Payload must be a JSON object" };
  }

  const body = raw as Record<string, unknown>;

  const installId = trimString(body.install_id, 64);
  if (!installId || !ID_RE.test(installId)) {
    return { ok: false, error: "Invalid install_id" };
  }

  const sessionId = trimString(body.session_id, 64);
  if (!sessionId || !ID_RE.test(sessionId)) {
    return { ok: false, error: "Invalid session_id" };
  }

  const appVersion = trimString(body.app_version, 32);
  if (!appVersion) {
    return { ok: false, error: "Invalid app_version" };
  }

  const ramGb = normalizeRamGb(body.ram_gb);
  if (ramGb === "invalid") {
    return { ok: false, error: "Invalid ram_gb" };
  }

  if (!Array.isArray(body.events) || body.events.length === 0) {
    return { ok: false, error: "events must be a non-empty array" };
  }
  if (body.events.length > MAX_EVENTS_PER_BATCH) {
    return { ok: false, error: `events exceeds max batch size (${MAX_EVENTS_PER_BATCH})` };
  }

  const events: NormalizedEvent[] = [];
  for (let i = 0; i < body.events.length; i++) {
    const item = body.events[i];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `events[${i}] must be an object` };
    }
    const record = item as Record<string, unknown>;
    const name = trimString(record.name, 64);
    if (!name || !EVENT_NAME_RE.test(name)) {
      return { ok: false, error: `events[${i}].name is invalid` };
    }

    let properties: string | null = null;
    if (record.props !== undefined && record.props !== null) {
      if (typeof record.props !== "object" || Array.isArray(record.props)) {
        return { ok: false, error: `events[${i}].props must be an object` };
      }
      const serialized = JSON.stringify(record.props);
      if (serialized.length > MAX_PROPS_BYTES) {
        return { ok: false, error: `events[${i}].props exceeds size limit` };
      }
      properties = serialized;
    }

    events.push({
      name,
      ts: clampTimestamp(record.ts, now),
      properties,
    });
  }

  return {
    ok: true,
    data: {
      installId,
      sessionId,
      appVersion,
      osVersion: trimString(body.os_version, 64),
      arch: trimString(body.arch, 32),
      ramGb,
      country: normalizeCountry(countryHeader),
      receivedAt: now,
      events,
    },
  };
}

export async function ingestTelemetryBatch(
  db: D1Database,
  batch: NormalizedTelemetryBatch,
): Promise<void> {
  const latestEventTs = batch.events.reduce(
    (max, event) => (event.ts > max ? event.ts : max),
    batch.receivedAt,
  );
  const earliestEventTs = batch.events.reduce(
    (min, event) => (event.ts < min ? event.ts : min),
    batch.receivedAt,
  );

  const upsertInstall = db
    .prepare(
      `INSERT INTO installs (
        install_id, first_seen_at, last_seen_at, app_version, os_version, arch, ram_gb, country
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(install_id) DO UPDATE SET
        last_seen_at = MAX(installs.last_seen_at, excluded.last_seen_at),
        app_version  = excluded.app_version,
        os_version   = COALESCE(excluded.os_version, installs.os_version),
        arch         = COALESCE(excluded.arch, installs.arch),
        ram_gb       = COALESCE(excluded.ram_gb, installs.ram_gb),
        country      = COALESCE(excluded.country, installs.country)`,
    )
    .bind(
      batch.installId,
      earliestEventTs,
      latestEventTs,
      batch.appVersion,
      batch.osVersion,
      batch.arch,
      batch.ramGb,
      batch.country,
    );

  const insertEventStmt = db.prepare(
    `INSERT INTO events (
      install_id, session_id, event_name, app_version, properties, created_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  );

  const statements: D1PreparedStatement[] = [
    upsertInstall,
    ...batch.events.map((event) =>
      insertEventStmt.bind(
        batch.installId,
        batch.sessionId,
        event.name,
        batch.appVersion,
        event.properties,
        event.ts,
      ),
    ),
  ];

  await db.batch(statements);
}
