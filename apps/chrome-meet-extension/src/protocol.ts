/** Google Meet extension speaker-tracking — wire protocol v1 with Amie `meet_bridge`. */

export const PROTOCOL_VERSION = 1;
export const EXTENSION_VERSION = "0.1.0";
export const PORT_NAME = "google-meet";

export type Participant = {
  id: string;
  name: string;
  self: boolean;
};

export type HeartbeatHealth = {
  meters: number;
  last_meter_change_ms_ago: number | null;
  selectors: "default" | "discovered";
};

export type ClientMessage =
  | {
      type: "hello";
      protocol: number;
      extension_version: string;
      browser: string;
      instance_id: string;
    }
  | {
      type: "call";
      tab: string;
      state: "joined" | "left";
      meeting_code?: string;
      observed_at: number;
    }
  | { type: "roster"; tab: string; participants: Participant[] }
  | { type: "speakers"; tab: string; seq: number; observed_at: number; speaking: string[] }
  | {
      type: "heartbeat";
      tab: string;
      seq: number;
      observed_at: number;
      speaking: string[];
      visibility: "visible" | "hidden";
      health: HeartbeatHealth;
    }
  | { type: "health"; tab: string; status: "ok" | "degraded"; reason?: string };

export type SelectorOverride = {
  participant: string;
  meter: string;
  name: string;
  panel_row: string;
};

export type ServerMessage = {
  type: "welcome";
  protocol: number;
  app_version: string;
  recording: boolean;
  selectors: SelectorOverride | null;
};

/** Content script → service worker. The worker adds `tab` before `meet_bridge`. */
export type ContentEvent =
  | { type: "call"; state: "joined" | "left"; meeting_code: string | null; observed_at: number }
  | { type: "roster"; participants: Participant[] }
  | { type: "speakers"; seq: number; observed_at: number; speaking: string[] }
  | {
      type: "heartbeat";
      seq: number;
      observed_at: number;
      speaking: string[];
      visibility: "visible" | "hidden";
      health: HeartbeatHealth;
    }
  | { type: "health"; status: "ok" | "degraded"; reason?: string }
  | { type: "trace-dump"; payload: unknown };

export function parseClientMessage(value: unknown): ClientMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  switch (value.type) {
    case "hello":
      if (value.protocol !== PROTOCOL_VERSION) return null;
      if (!isString(value.extension_version) || !isString(value.browser) || !isString(value.instance_id)) {
        return null;
      }
      return value as ClientMessage;
    case "call":
      if (value.state !== "joined" && value.state !== "left") return null;
      if (!isString(value.tab) || typeof value.observed_at !== "number") return null;
      return value as ClientMessage;
    case "roster":
      if (!isString(value.tab) || !Array.isArray(value.participants)) return null;
      return value as ClientMessage;
    case "speakers":
      if (!isString(value.tab) || typeof value.seq !== "number" || typeof value.observed_at !== "number") {
        return null;
      }
      if (!Array.isArray(value.speaking)) return null;
      return value as ClientMessage;
    case "heartbeat":
      if (!isString(value.tab) || typeof value.seq !== "number" || !Array.isArray(value.speaking)) {
        return null;
      }
      if (value.visibility !== "visible" && value.visibility !== "hidden") return null;
      return value as ClientMessage;
    case "health":
      if (!isString(value.tab) || (value.status !== "ok" && value.status !== "degraded")) return null;
      return value as ClientMessage;
    default:
      return null;
  }
}

export function parseServerMessage(raw: string): ServerMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.type !== "welcome") return null;
  if (typeof value.protocol !== "number" || !isString(value.app_version) || typeof value.recording !== "boolean") {
    return null;
  }
  const selectors = value.selectors == null ? null : parseSelectors(value.selectors);
  if (value.selectors != null && selectors == null) return null;
  return {
    type: "welcome",
    protocol: value.protocol,
    app_version: value.app_version,
    recording: value.recording,
    selectors,
  };
}

function parseSelectors(value: unknown): SelectorOverride | null {
  if (!isRecord(value)) return null;
  if (!isString(value.participant) || !isString(value.meter) || !isString(value.name) || !isString(value.panel_row)) {
    return null;
  }
  return {
    participant: value.participant,
    meter: value.meter,
    name: value.name,
    panel_row: value.panel_row,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
