/** Google Meet extension speaker-tracking — content script (level meters → speaking ids). */

import { PORT_NAME, type ContentEvent, type HeartbeatHealth, type SelectorOverride } from "../protocol";
import { detectCall } from "./call";
import { createDetector } from "./detector";
import { watchMeters, type MeterWatch } from "./meters";
import { readRoster } from "./roster";
import { DEFAULT_SELECTORS, selectorsFromOverride, type Selectors } from "./selectors";
import { selfIdFromCorrelation } from "./self";
import { observedAt } from "./time";
import { anonymizeTrace, type TraceEvent } from "./trace";

const LEAVE_MS = 5_000;

let selectors: Selectors = { ...DEFAULT_SELECTORS };
let port: chrome.runtime.Port | null = null;
let joined = false;
let seq = 0;
let lastSpeakingKey = "";
let missingSince: number | null = null;
let tracing = false;
let rosterTimer: number | null = null;
const trace: TraceEvent[] = [];
const toolbarChanges: number[] = [];
const participantChanges = new Map<string, number[]>();
const detector = createDetector();
let participants = readRoster(document, selectors, []);
let meters: MeterWatch | null = null;

function connectPort() {
  if (port) return;
  const next = chrome.runtime.connect({ name: PORT_NAME });
  port = next;
  next.onMessage.addListener(onControl);
  next.onDisconnect.addListener(() => {
    if (port === next) port = null;
    // Re-announce the call. A restarted service worker has an empty tab and the fake
    // page never mutates its tile list, so the one-shot roster would otherwise stay lost.
    if (joined) window.setTimeout(() => syncCall(true), 500);
  });
}

function post(message: ContentEvent) {
  connectPort();
  try {
    port?.postMessage(message);
  } catch {
    port = null;
  }
}

function onControl(message: unknown) {
  if (!message || typeof message !== "object") return;
  const control = message as { type?: string; enabled?: boolean; selectors?: SelectorOverride };
  if (control.type === "selectors" && control.selectors) {
    selectors = selectorsFromOverride(control.selectors);
    restartMeters();
    scheduleRoster();
  } else if (control.type === "trace") {
    tracing = Boolean(control.enabled);
    if (tracing) trace.length = 0;
  } else if (control.type === "trace-dump") {
    post({
      type: "trace-dump",
      payload: anonymizeTrace(
        trace,
        participants.map((participant) => ({ id: participant.id, name: participant.name })),
      ),
    });
  }
}

function publishSpeaking(heartbeat: boolean) {
  const now = observedAt();
  const speaking = [...detector.speaking(now)].sort();
  const key = speaking.join("\n");
  if (key !== lastSpeakingKey) {
    lastSpeakingKey = key;
    seq += 1;
    post({ type: "speakers", seq, observed_at: now, speaking });
  }
  if (!heartbeat) return;
  seq += 1;
  post({
    type: "heartbeat",
    seq,
    observed_at: now,
    speaking,
    visibility: document.visibilityState === "visible" ? "visible" : "hidden",
    health: health(),
  });
}

function health(): HeartbeatHealth {
  const last = meters?.lastChangeAt() ?? null;
  return {
    meters: meters?.meterCount() ?? 0,
    last_meter_change_ms_ago: last == null ? null : Math.max(0, Math.round(observedAt() - last)),
    selectors: meters?.usingDiscoveredSelector() ? "discovered" : "default",
  };
}

function rememberChange(id: string | null, at: number) {
  const bucket = id == null ? toolbarChanges : (participantChanges.get(id) ?? []);
  bucket.push(at);
  const trimmed = bucket.slice(-32);
  if (id == null) {
    toolbarChanges.length = 0;
    toolbarChanges.push(...trimmed);
    return;
  }
  participantChanges.set(id, trimmed);
}

function applySelf() {
  // "(You)" on any participant node (tile or panel, including text after the
  // marker) already identified the local user. Toolbar lockstep is a fallback
  // only when that label is absent. An ambiguous lockstep marks nobody
  // (fake Meet Ada + Pavel sharing a 100ms flicker must not drop Ada).
  if (participants.some((participant) => participant.self)) return;
  const correlated = selfIdFromCorrelation(toolbarChanges, participantChanges);
  if (!correlated) return;
  participants = participants.map((participant) =>
    participant.id === correlated ? { ...participant, self: true } : participant,
  );
}

function scheduleRoster() {
  if (rosterTimer != null) window.clearTimeout(rosterTimer);
  rosterTimer = window.setTimeout(() => {
    rosterTimer = null;
    participants = readRoster(document, selectors, participants);
    applySelf();
    if (joined) post({ type: "roster", participants });
  }, 250);
}

function announcePresence(code: string | null) {
  post({
    type: "call",
    state: "joined",
    meeting_code: code,
    observed_at: observedAt(),
  });
  participants = readRoster(document, selectors, participants);
  applySelf();
  post({ type: "roster", participants });
}

function syncCall(heartbeat: boolean) {
  const detected = detectCall(location.pathname, document, selectors);
  if (detected.inCall) {
    missingSince = null;
    const fresh = !joined;
    if (fresh) joined = true;
    // Heartbeats repeat the roster. The static fake page only changes meter classes,
    // so a roster posted before the service worker listener exists would never return.
    if (fresh || heartbeat) announcePresence(detected.code);
    publishSpeaking(heartbeat);
    return;
  }
  if (!joined) return;
  if (missingSince == null) missingSince = Date.now();
  if (Date.now() - missingSince < LEAVE_MS) return;
  joined = false;
  missingSince = null;
  post({
    type: "call",
    state: "left",
    meeting_code: detected.code,
    observed_at: observedAt(),
  });
  port?.disconnect();
  port = null;
}

function restartMeters() {
  meters?.stop();
  meters = watchMeters(
    document,
    () => selectors,
    (hit) => {
      rememberChange(hit.participantId, hit.at);
      if (hit.participantId) {
        detector.onMeter({
          participantId: hit.participantId,
          meterId: hit.meterId,
          at: hit.at,
          tokens: hit.tokens,
        });
        if (tracing) trace.push({ t: hit.at, participantId: hit.participantId, tokens: hit.tokens });
        if (joined) publishSpeaking(false);
      }
    },
    () => {
      scheduleRoster();
      syncCall(false);
    },
    (meterSelector) => {
      selectors = { ...selectors, meter: meterSelector };
      post({ type: "health", status: "degraded", reason: "meter-discovered" });
      restartMeters();
    },
  );
}

restartMeters();
window.setInterval(() => syncCall(true), 1_000);
window.addEventListener("pagehide", () => {
  if (!joined) return;
  joined = false;
  post({ type: "call", state: "left", meeting_code: null, observed_at: observedAt() });
});
syncCall(false);
