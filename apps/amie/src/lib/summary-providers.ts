import type { AsrSettings, SummaryProvider, SummarySettings } from "./transcript-types";

export function summaryProviderHasKey(
  id: string,
  asr: AsrSettings | null,
  summary: SummarySettings | null,
): boolean {
  if (!asr || !summary) return false;
  switch (id) {
    case "xai":
      return asr.xaiApiKeySet;
    case "openai":
      return summary.openaiApiKeySet;
    case "gemini":
      return summary.geminiApiKeySet;
    default:
      return false;
  }
}
