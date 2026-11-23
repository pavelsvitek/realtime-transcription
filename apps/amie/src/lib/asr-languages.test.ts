import { describe, expect, it } from "vitest";
import { ASR_LANGUAGES, asrLanguageLabel } from "./asr-languages";

describe("ASR_LANGUAGES", () => {
  it("lists auto first followed by all 25 supported European languages", () => {
    expect(ASR_LANGUAGES[0]).toEqual({
      code: "auto",
      label: "Auto (detect automatically)",
    });
    expect(ASR_LANGUAGES).toHaveLength(26);
    const codes = new Set(ASR_LANGUAGES.map((item) => item.code));
    expect(codes.size).toBe(26);
    expect(codes.has("en")).toBe(true);
    expect(codes.has("cs")).toBe(true);
    expect(codes.has("sk")).toBe(true);
    expect(codes.has("de")).toBe(true);
  });

  it("keeps explicit languages sorted alphabetically by label", () => {
    const labels = ASR_LANGUAGES.slice(1).map((item) => item.label);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b));
    expect(labels).toEqual(sorted);
  });

  it("formats known and fallback language labels", () => {
    expect(asrLanguageLabel("auto")).toBe("Auto (detect automatically)");
    expect(asrLanguageLabel("cs")).toBe("Czech");
    expect(asrLanguageLabel("unknown")).toBe("unknown");
  });
});
