export type MicIndicatorState = "error" | "muted" | "recording" | "idle";

export const MIC_MUTED_LABEL = "Muted in your meeting. Amie is not recording your voice.";

/** Which look the mic icon takes. A real error wins; muted only matters during a session. */
export function micIndicatorState({
  isActive,
  micActive,
  micMuted,
  error,
}: {
  isActive: boolean;
  micActive: boolean;
  micMuted: boolean;
  error: string | null;
}): MicIndicatorState {
  if (error) return "error";
  if (isActive && micMuted) return "muted";
  if (isActive && micActive) return "recording";
  return "idle";
}
