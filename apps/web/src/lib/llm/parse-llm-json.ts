import { jsonrepair } from "jsonrepair";

export type ParseLlmJsonResult =
  | { ok: true; value: unknown; method: "direct" | "extract" | "repair" | "extract-repair" }
  | { ok: false; error: string };

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function tryParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Defensive JSON parse for LLM output: direct parse, brace extraction,
 * then jsonrepair for truncated or slightly malformed payloads.
 */
export function parseLlmJson(rawText: string): ParseLlmJsonResult {
  const cleaned = stripMarkdownFences(rawText);
  if (!cleaned) {
    return { ok: false, error: "Empty response text" };
  }

  const direct = tryParse(cleaned);
  if (direct !== null) {
    return { ok: true, value: direct, method: "direct" };
  }

  const extracted = extractJsonObject(cleaned);
  if (extracted) {
    const parsed = tryParse(extracted);
    if (parsed !== null) {
      return { ok: true, value: parsed, method: "extract" };
    }

    try {
      const repaired = jsonrepair(extracted);
      const parsedRepaired = tryParse(repaired);
      if (parsedRepaired !== null) {
        return { ok: true, value: parsedRepaired, method: "extract-repair" };
      }
    } catch {
      // fall through
    }
  }

  try {
    const repaired = jsonrepair(cleaned);
    const parsed = tryParse(repaired);
    if (parsed !== null) {
      return { ok: true, value: parsed, method: "repair" };
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "jsonrepair failed",
    };
  }

  return { ok: false, error: "Could not parse or repair JSON" };
}
