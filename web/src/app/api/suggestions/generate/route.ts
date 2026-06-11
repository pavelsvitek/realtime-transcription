import { generateSuggestions, isGeminiConfigured } from "@/lib/llm/gemini";
import {
  normalizeGenerateRequest,
  summarizeItemStates,
} from "@/lib/llm/normalize-generate-request";
import type { SessionMode } from "@/lib/session/types";
import { NextResponse } from "next/server";

const VALID_MODES: SessionMode[] = ["customer_interview"];

export async function POST(httpRequest: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await httpRequest.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const request = normalizeGenerateRequest(body, VALID_MODES);
  if (!request) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const itemStates = summarizeItemStates(request);
    console.log("[suggestions/api] item states:", itemStates);

    const items = await generateSuggestions(request);
    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Suggestion generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
