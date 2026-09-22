import { describe, expect, it } from "vitest";
import type { AsrSettings, SummarySettings } from "./transcript-types";
import { summaryProviderHasKey } from "./summary-providers";

const asr = (xaiApiKeySet: boolean): AsrSettings => ({
  backendOptions: [],
  xaiApiKeySet,
  xaiApiKeySaved: xaiApiKeySet,
  xaiApiKeyFromEnv: false,
});

const summary = (openai: boolean, gemini: boolean): SummarySettings => ({
  provider: "xai",
  providerFromEnv: false,
  openaiApiKeySet: openai,
  openaiApiKeySaved: openai,
  openaiApiKeyFromEnv: false,
  geminiApiKeySet: gemini,
  geminiApiKeySaved: gemini,
  geminiApiKeyFromEnv: false,
});

describe("summaryProviderHasKey", () => {
  it("enables a provider only when that provider's key is set", () => {
    const settings = asr(true);
    const summaries = summary(false, true);
    expect(summaryProviderHasKey("xai", settings, summaries)).toBe(true);
    expect(summaryProviderHasKey("openai", settings, summaries)).toBe(false);
    expect(summaryProviderHasKey("gemini", settings, summaries)).toBe(true);
  });

  it("treats providers as unavailable until settings have loaded", () => {
    expect(summaryProviderHasKey("xai", null, summary(true, true))).toBe(false);
    expect(summaryProviderHasKey("openai", asr(true), null)).toBe(false);
  });
});
