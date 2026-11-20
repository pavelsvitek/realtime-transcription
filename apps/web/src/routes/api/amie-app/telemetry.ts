import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import {
  ingestTelemetryBatch,
  MAX_PAYLOAD_BYTES,
  validateTelemetryPayload,
} from "@/lib/telemetry";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/amie-app/telemetry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
          return jsonError("Payload too large", 413);
        }

        let rawText: string;
        try {
          rawText = await request.text();
        } catch {
          return jsonError("Failed to read body", 400);
        }

        if (new TextEncoder().encode(rawText).byteLength > MAX_PAYLOAD_BYTES) {
          return jsonError("Payload too large", 413);
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return jsonError("Invalid JSON", 400);
        }

        const validation = validateTelemetryPayload(
          parsed,
          request.headers.get("cf-ipcountry"),
        );
        if (!validation.ok) {
          return jsonError(validation.error, 400);
        }

        try {
          await ingestTelemetryBatch(env.TELEMETRY_DB, validation.data);
        } catch (err) {
          console.error("Failed to ingest telemetry batch", err);
          return jsonError("Internal server error", 500);
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
