import type { DeviceKind } from "./transcript-types";

const INTERNAL_MIC_LABEL = "Internal MacBook microphone";

export function getMicrophoneTooltipLabel(
  deviceName: string | null,
  deviceKind: DeviceKind | null,
  deviceError: string | null,
): string {
  if (deviceError) return deviceError;
  if (deviceKind === "builtInMic") return INTERNAL_MIC_LABEL;
  if (deviceName) return deviceName;
  return INTERNAL_MIC_LABEL;
}

export function getMicrophoneRecordingName(
  deviceName: string | null,
  deviceKind: DeviceKind | null,
): string {
  if (deviceKind === "builtInMic") return "Internal MacBook";
  if (deviceName) return deviceName;
  return "Internal MacBook";
}

export function usesMicrophoneInput(source: "mic" | "system" | "both"): boolean {
  return source === "mic" || source === "both";
}
