/** Google Meet extension speaker-tracking — service worker, one WebSocket to Amie `meet_bridge`. */

import { detectBrowser } from "./browser";
import {
  EXTENSION_VERSION,
  PORT_NAME,
  PROTOCOL_VERSION,
  parseServerMessage,
  type ClientMessage,
  type ContentEvent,
  type SelectorOverride,
} from "./protocol";
import {
  applyContentEvent,
  createPendingQueue,
  emptyTab,
  hasInCallTab,
  remoteSpeakingNames,
  type TabModel,
} from "./sw-state";
import { backoffDelay, nextPort } from "./transport";

type PopupStatus = {
  connected: boolean;
  appVersion: string | null;
  recording: boolean;
  inCallTabs: number;
  speakingNames: string[];
  lastError: string | null;
  port: number | null;
};

const tabs = new Map<number, { tabKey: string; model: TabModel; port: chrome.runtime.Port }>();
let attachSerial = 0;
const tabAttach = new Map<number, number>();
let instanceIdPromise: Promise<string> | null = null;
let socket: WebSocket | null = null;
let pending: WebSocket | null = null;
let connecting = false;
let generation = 0;
let connected = false;
let appVersion: string | null = null;
let recording = false;
let lastError: string | null = null;
let lastGood: number | null = null;
let traceEnabled = false;
let latestTrace: unknown = null;

void chrome.storage.local.get("lastPort").then((stored) => {
  if (typeof stored.lastPort === "number") lastGood = stored.lastPort;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  const tabId = port.sender?.tab?.id;
  if (tabId == null) {
    port.disconnect();
    return;
  }
  void attachTab(port, tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && typeof message === "object" ? (message as { type?: string }).type : undefined;
  if (type === "popup:status") {
    sendResponse(status());
    return undefined;
  }
  if (type === "popup:trace") {
    traceEnabled = Boolean((message as { enabled?: boolean }).enabled);
    for (const tab of tabs.values()) {
      tab.port.postMessage({ type: "trace", enabled: traceEnabled });
    }
    sendResponse({ ok: true });
    return undefined;
  }
  if (type === "popup:trace-dump") {
    latestTrace = null;
    for (const tab of tabs.values()) tab.port.postMessage({ type: "trace-dump" });
    setTimeout(() => sendResponse(latestTrace), 400);
    return true;
  }
  return undefined;
});

function attachTab(port: chrome.runtime.Port, tabId: number) {
  const queue = createPendingQueue<unknown>();
  let entry: { tabKey: string; model: TabModel; port: chrome.runtime.Port } | null = null;
  let closed = false;
  const generation = ++attachSerial;
  tabAttach.set(tabId, generation);

  // Register before any await. Chrome drops port messages that arrive with no listener,
  // and the content script posts call + roster in the same turn as connect().
  port.onMessage.addListener((message) => {
    queue.push(message, handleContentMessage);
  });
  port.onDisconnect.addListener(() => {
    closed = true;
    const current = tabs.get(tabId);
    if (!current || current.port !== port) return;
    tabs.delete(tabId);
    if (entry?.model.joined && socket && connected) {
      send({
        type: "call",
        tab: entry.tabKey,
        state: "left",
        observed_at: Date.now(),
      });
    }
    if (!hasInCallTab(models())) stopSocket();
  });

  void (async () => {
    const instanceId = await getInstanceId();
    if (closed || tabAttach.get(tabId) !== generation) return;
    const tabKey = `${instanceId}:${tabId}`;
    entry = { tabKey, model: emptyTab(tabKey), port };
    tabs.set(tabId, entry);
    if (traceEnabled) port.postMessage({ type: "trace", enabled: true });
    queue.open(handleContentMessage);
  })();

  function handleContentMessage(message: unknown) {
    if (!entry || !isContentEvent(message)) return;
    if (message.type === "trace-dump") {
      latestTrace = message.payload;
      return;
    }
    entry.model = applyContentEvent(entry.model, message);
    forward(entry.model.tabKey, message);
    ensureSocket();
  }
}

function forward(tabKey: string, event: ContentEvent) {
  if (event.type === "trace-dump") return;
  if (event.type === "call") {
    send({
      type: "call",
      tab: tabKey,
      state: event.state,
      meeting_code: event.meeting_code ?? undefined,
      observed_at: event.observed_at,
    });
    if (event.state === "left" && !hasInCallTab(models())) stopSocket();
    return;
  }
  if (event.type === "roster") {
    send({ type: "roster", tab: tabKey, participants: event.participants });
    return;
  }
  if (event.type === "speakers") {
    send({
      type: "speakers",
      tab: tabKey,
      seq: event.seq,
      observed_at: event.observed_at,
      speaking: event.speaking,
    });
    return;
  }
  if (event.type === "heartbeat") {
    send({
      type: "heartbeat",
      tab: tabKey,
      seq: event.seq,
      observed_at: event.observed_at,
      speaking: event.speaking,
      visibility: event.visibility,
      health: event.health,
    });
    return;
  }
  send({ type: "health", tab: tabKey, status: event.status, reason: event.reason });
}

function ensureSocket() {
  if (!hasInCallTab(models())) return;
  if (socket || connecting) return;
  const gen = generation;
  connecting = true;
  void connectLoop(gen);
}

async function connectLoop(gen: number) {
  let failures = 0;
  let attempt = 0;
  while (gen === generation && hasInCallTab(models())) {
    const port = nextPort(lastGood, attempt);
    attempt += 1;
    try {
      await openSocket(port, gen);
      failures = 0;
      attempt = 0;
    } catch (error) {
      if (gen !== generation) return;
      connected = false;
      socket = null;
      lastError = error instanceof Error ? error.message : "meet_bridge connection failed";
      await sleep(backoffDelay(failures));
      failures += 1;
    }
  }
  connecting = false;
}

function openSocket(port: number, gen: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    pending = ws;
    let opened = false;
    let settled = false;
    let timer = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (pending === ws) pending = null;
      if (error) reject(error);
      else resolve();
    };
    timer = setTimeout(() => {
      ws.close();
      finish(new Error(`meet_bridge timeout on ${port}`));
    }, 1_500);
    ws.addEventListener("open", () => {
      if (gen !== generation) {
        ws.close();
        finish(new Error("meet_bridge connect cancelled"));
        return;
      }
      opened = true;
      clearTimeout(timer);
      void sendHello(ws);
    });
    ws.addEventListener("message", (event) => {
      if (gen !== generation) return;
      const welcome = parseServerMessage(String(event.data));
      if (!welcome) return;
      if (welcome.protocol !== PROTOCOL_VERSION) {
        lastError = `Amie meet_bridge speaks protocol ${welcome.protocol}`;
        ws.close();
        return;
      }
      connected = true;
      appVersion = welcome.app_version;
      recording = welcome.recording;
      lastError = null;
      lastGood = port;
      socket = ws;
      void chrome.storage.local.set({ lastPort: port });
      if (welcome.selectors) pushSelectors(welcome.selectors);
      replay(ws);
    });
    ws.addEventListener("error", () => {
      if (!opened) finish(new Error(`meet_bridge refused ws://127.0.0.1:${port}`));
    });
    ws.addEventListener("close", (event) => {
      if (socket === ws) socket = null;
      if (gen === generation) connected = false;
      if (event.reason) lastError = event.reason;
      finish(opened ? undefined : new Error(event.reason || `meet_bridge closed ${port}`));
    });
  });
}

async function sendHello(ws: WebSocket) {
  const hello: ClientMessage = {
    type: "hello",
    protocol: PROTOCOL_VERSION,
    extension_version: EXTENSION_VERSION,
    browser: await detectBrowser(),
    instance_id: await getInstanceId(),
  };
  ws.send(JSON.stringify(hello));
}

function replay(ws: WebSocket) {
  for (const tab of models()) {
    if (!tab.joined) continue;
    ws.send(
      JSON.stringify({
        type: "call",
        tab: tab.tabKey,
        state: "joined",
        meeting_code: tab.meetingCode,
        observed_at: tab.observedAt || Date.now(),
      }),
    );
    ws.send(JSON.stringify({ type: "roster", tab: tab.tabKey, participants: tab.participants }));
    ws.send(
      JSON.stringify({
        type: "speakers",
        tab: tab.tabKey,
        seq: tab.seq,
        observed_at: tab.observedAt || Date.now(),
        speaking: tab.speaking,
      }),
    );
  }
}

function pushSelectors(selectors: SelectorOverride) {
  for (const tab of tabs.values()) tab.port.postMessage({ type: "selectors", selectors });
}

function send(message: ClientMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function stopSocket() {
  generation += 1;
  connecting = false;
  connected = false;
  appVersion = null;
  recording = false;
  pending?.close();
  pending = null;
  socket?.close();
  socket = null;
}

function status(): PopupStatus {
  const modelsNow = models();
  return {
    connected,
    appVersion,
    recording,
    inCallTabs: modelsNow.filter((tab) => tab.joined).length,
    speakingNames: remoteSpeakingNames(modelsNow),
    lastError,
    port: lastGood,
  };
}

function models(): TabModel[] {
  return [...tabs.values()].map((tab) => tab.model);
}

function isContentEvent(value: unknown): value is ContentEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: string }).type;
  return (
    type === "call" ||
    type === "roster" ||
    type === "speakers" ||
    type === "heartbeat" ||
    type === "health" ||
    type === "trace-dump"
  );
}

async function getInstanceId(): Promise<string> {
  if (!instanceIdPromise) {
    instanceIdPromise = chrome.storage.local.get("instanceId").then(async (stored) => {
      if (typeof stored.instanceId === "string" && stored.instanceId) return stored.instanceId;
      const created = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      await chrome.storage.local.set({ instanceId: created });
      return created;
    });
  }
  return instanceIdPromise;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
