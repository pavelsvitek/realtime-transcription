/** Google Meet extension speaker-tracking — popup: connected to Amie `meet_bridge`? */

type PopupStatus = {
  connected: boolean;
  appVersion: string | null;
  recording: boolean;
  inCallTabs: number;
  speakingNames: string[];
  selfSpeakingNames: string[];
  lastError: string | null;
  port: number | null;
};

const connection = document.querySelector("#connection");
const detail = document.querySelector("#detail");
const speakers = document.querySelector("#speakers");
const selfSpeaking = document.querySelector("#self-speaking");
const trace = document.querySelector<HTMLInputElement>("#trace");
const download = document.querySelector<HTMLButtonElement>("#download");

async function refresh() {
  const status = await chrome.runtime.sendMessage({ type: "popup:status" });
  render(status as PopupStatus);
}

function render(status: PopupStatus | undefined) {
  if (!connection || !detail || !speakers || !selfSpeaking) return;
  if (!status?.connected) {
    connection.textContent = "Not connected";
    connection.className = "bad";
    detail.textContent = status?.lastError ?? "Join a Google Meet call while Amie Dev is running.";
    speakers.textContent = "";
    selfSpeaking.textContent = "";
    return;
  }
  connection.textContent = "Connected";
  connection.className = "ok";
  const version = status.appVersion ? `Amie ${status.appVersion}` : "Amie";
  const recording = status.recording ? "recording" : "not recording";
  detail.textContent = `${version} · ${recording} · ${status.inCallTabs} in-call tab${status.inCallTabs === 1 ? "" : "s"}`;
  speakers.textContent = status.speakingNames.length
    ? `Speaking: ${status.speakingNames.join(", ")}`
    : "Nobody remote is speaking.";
  const selfNames = status.selfSpeakingNames ?? [];
  selfSpeaking.textContent = selfNames.length
    ? `You are speaking (${selfNames.join(", ")})`
    : "";
}

trace?.addEventListener("change", () => {
  void chrome.runtime.sendMessage({ type: "popup:trace", enabled: trace.checked });
});

download?.addEventListener("click", async () => {
  const payload = await chrome.runtime.sendMessage({ type: "popup:trace-dump" });
  if (!payload) return;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "meet-meter-trace.json";
  link.click();
  URL.revokeObjectURL(url);
});

void refresh();
window.setInterval(() => void refresh(), 500);
