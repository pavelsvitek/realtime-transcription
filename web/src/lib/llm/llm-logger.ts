const LOG_PREFIX = "[suggestions/llm]";

function divider(label: string): void {
  console.log(`\n${LOG_PREFIX} ${"─".repeat(60)}`);
  console.log(`${LOG_PREFIX} ${label}`);
  console.log(`${LOG_PREFIX} ${"─".repeat(60)}`);
}

export function logGeminiRequest(input: {
  model: string;
  mode: string;
  systemPrompt: string;
  userPrompt: string;
  requestPayload: unknown;
  itemStateSummary?: Record<string, number>;
}): void {
  divider("REQUEST");
  console.log(`${LOG_PREFIX} model:`, input.model);
  console.log(`${LOG_PREFIX} mode:`, input.mode);
  if (input.itemStateSummary) {
    console.log(`${LOG_PREFIX} item states:`, input.itemStateSummary);
  }
  console.log(`${LOG_PREFIX} request payload:\n`, JSON.stringify(input.requestPayload, null, 2));
  console.log(`${LOG_PREFIX} system prompt:\n`, input.systemPrompt);
  console.log(`${LOG_PREFIX} user prompt:\n`, input.userPrompt);
}

export function logGeminiResponse(input: {
  model: string;
  rawText: string | undefined;
  parsed?: unknown;
  durationMs: number;
  finishReason?: string;
  usageMetadata?: unknown;
  parseMethod?: string;
  attempt?: number;
}): void {
  divider("RESPONSE");
  console.log(`${LOG_PREFIX} model:`, input.model);
  if (input.attempt !== undefined) {
    console.log(`${LOG_PREFIX} attempt:`, input.attempt);
  }
  console.log(`${LOG_PREFIX} duration: ${input.durationMs}ms`);
  if (input.finishReason) {
    console.log(`${LOG_PREFIX} finishReason:`, input.finishReason);
  }
  if (input.usageMetadata !== undefined) {
    console.log(
      `${LOG_PREFIX} usage:\n`,
      JSON.stringify(input.usageMetadata, null, 2),
    );
  }
  if (input.parseMethod) {
    console.log(`${LOG_PREFIX} parse method:`, input.parseMethod);
  }
  console.log(`${LOG_PREFIX} raw text:\n`, input.rawText ?? "(empty)");

  if (input.parsed !== undefined) {
    console.log(`${LOG_PREFIX} parsed JSON:\n`, JSON.stringify(input.parsed, null, 2));
  }
}

export function logGeminiError(input: {
  model: string;
  message: string;
  rawText?: string;
  cause?: unknown;
}): void {
  divider("ERROR");
  console.error(`${LOG_PREFIX} model:`, input.model);
  console.error(`${LOG_PREFIX} message:`, input.message);
  if (input.rawText !== undefined) {
    console.error(`${LOG_PREFIX} raw text:\n`, input.rawText);
  }
  if (input.cause !== undefined) {
    console.error(`${LOG_PREFIX} cause:`, input.cause);
  }
}
