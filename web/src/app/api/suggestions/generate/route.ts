import { generateSuggestions, isGeminiConfigured } from "@/lib/llm/gemini";
import type {
  GenerateSuggestionsRequest,
  SessionMode,
} from "@/lib/session/types";
import { NextResponse } from "next/server";

const VALID_MODES: SessionMode[] = ["customer_interview"];

function isValidRequest(body: unknown): body is GenerateSuggestionsRequest {
  if (!body || typeof body !== "object") return false;

  const request = body as GenerateSuggestionsRequest;
  if (!VALID_MODES.includes(request.mode)) return false;
  if (!Array.isArray(request.cards)) return false;
  if (!Array.isArray(request.transcriptChunk)) return false;

  return true;
}

export async function POST(request: Request) {
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidRequest(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const items = await generateSuggestions(body);
    return NextResponse.json({ items });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Suggestion generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
