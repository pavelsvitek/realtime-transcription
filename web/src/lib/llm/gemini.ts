import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import type {
  GenerateSuggestionsRequest,
  GeneratedSuggestion,
} from "@/lib/session/types";
import {
  DEFAULT_LLM_MODEL,
  LLM_MAX_OUTPUT_TOKENS,
  LLM_MAX_OUTPUT_TOKENS_RETRY,
} from "./constants";
import {
  logGeminiError,
  logGeminiRequest,
  logGeminiResponse,
} from "./llm-logger";
import { parseLlmJson } from "./parse-llm-json";
import {
  buildSystemPrompt,
  buildUserPrompt,
  SUGGESTIONS_RESPONSE_JSON_SCHEMA,
} from "./prompt";
import { validateSuggestionsResponse } from "./validate-response";

function getApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
}

function getModelId(): string {
  return process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
}

export function isGeminiConfigured(): boolean {
  return Boolean(getApiKey());
}

function getFinishReason(response: GenerateContentResponse): string | undefined {
  return response.candidates?.[0]?.finishReason;
}

function shouldRetry(finishReason: string | undefined, parseOk: boolean): boolean {
  if (parseOk) return false;
  return finishReason === "MAX_TOKENS" || finishReason === "OTHER";
}

async function callGemini(input: {
  ai: GoogleGenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
}): Promise<GenerateContentResponse> {
  return input.ai.models.generateContent({
    model: input.model,
    contents: input.userPrompt,
    config: {
      systemInstruction: input.systemPrompt,
      temperature: 0.2,
      maxOutputTokens: input.maxOutputTokens,
      responseMimeType: "application/json",
      responseJsonSchema: SUGGESTIONS_RESPONSE_JSON_SCHEMA,
      // Gemini 2.5 Flash spends thinking tokens from the output budget by default,
      // which truncates structured JSON mid-string. Disable for low-latency JSON.
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
}

export async function generateSuggestions(
  request: GenerateSuggestionsRequest,
): Promise<GeneratedSuggestion[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const model = getModelId();
  const ai = new GoogleGenAI({ apiKey });
  const systemPrompt = buildSystemPrompt(request.mode);
  const userPrompt = buildUserPrompt(request);

  logGeminiRequest({
    model,
    mode: request.mode,
    systemPrompt,
    userPrompt,
    requestPayload: request,
  });

  const tokenLimits = [LLM_MAX_OUTPUT_TOKENS, LLM_MAX_OUTPUT_TOKENS_RETRY];

  for (let attempt = 0; attempt < tokenLimits.length; attempt += 1) {
    const maxOutputTokens = tokenLimits[attempt];
    const startedAt = performance.now();

    let response: GenerateContentResponse;
    try {
      response = await callGemini({
        ai,
        model,
        systemPrompt,
        userPrompt,
        maxOutputTokens,
      });
    } catch (error) {
      logGeminiError({
        model,
        message: "Gemini API call failed",
        cause: error,
      });
      throw error;
    }

    const durationMs = Math.round(performance.now() - startedAt);
    const text = response.text?.trim();
    const finishReason = getFinishReason(response);

    if (!text) {
      logGeminiResponse({
        model,
        rawText: text,
        durationMs,
        finishReason,
        usageMetadata: response.usageMetadata,
        attempt: attempt + 1,
      });
      return [];
    }

    const parseResult = parseLlmJson(text);

    if (parseResult.ok) {
      logGeminiResponse({
        model,
        rawText: text,
        parsed: parseResult.value,
        durationMs,
        finishReason,
        usageMetadata: response.usageMetadata,
        parseMethod: parseResult.method,
        attempt: attempt + 1,
      });
      return validateSuggestionsResponse(parseResult.value, request);
    }

    const isLastAttempt = attempt === tokenLimits.length - 1;
    const canRetry = !isLastAttempt && shouldRetry(finishReason, false);

    if (canRetry) {
      logGeminiError({
        model,
        message: `Parse failed (${parseResult.error}); retrying with higher token limit`,
        rawText: text,
        cause: { finishReason, maxOutputTokens },
      });
      continue;
    }

    logGeminiError({
      model,
      message: parseResult.error,
      rawText: text,
      cause: { finishReason, maxOutputTokens },
    });

    // Prefer empty suggestions over failing the live session.
    return [];
  }

  return [];
}
