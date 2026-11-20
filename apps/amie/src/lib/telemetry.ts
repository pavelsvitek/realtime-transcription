import { invoke } from "@tauri-apps/api/core";

export type TelemetryProps = Record<string, string | number | boolean | null>;

export interface TelemetrySettings {
  enabled: boolean;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Best-effort anonymous product telemetry event.
 * No-ops outside the Tauri runtime and never throws.
 */
export function trackEvent(name: string, props?: TelemetryProps): void {
  if (!isTauriRuntime()) return;
  void invoke("track_telemetry_event", {
    name,
    props: props ?? null,
  }).catch(() => {
    // Telemetry must never interrupt app UX.
  });
}

export async function getTelemetrySettings(): Promise<TelemetrySettings> {
  if (!isTauriRuntime()) return { enabled: true };
  return invoke<TelemetrySettings>("get_telemetry_settings");
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke("set_telemetry_enabled", { enabled });
}
