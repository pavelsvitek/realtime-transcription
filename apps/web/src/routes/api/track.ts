import { createFileRoute } from "@tanstack/react-router";

const EVENTS = new Set(["download_click", "download_unsupported"]);
const LOCATIONS = new Set(["hero", "nav"]);

/**
 * Receives product events from the browser and writes one structured JSON log
 * line each. Workers Observability indexes the fields, so they can be queried
 * and charted under `event = "download_click"`.
 */
export const Route = createFileRoute("/api/track")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Record<string, unknown> = {};
        try {
          body = await request.json();
        } catch {
          return new Response(null, { status: 400 });
        }
        const event = String(body.event);
        if (!EVENTS.has(event)) return new Response(null, { status: 400 });
        const location = String(body.location);

        console.log(
          JSON.stringify({
            event,
            location: LOCATIONS.has(location) ? location : "unknown",
            os: String(body.os ?? "").slice(0, 32),
            country: request.headers.get("cf-ipcountry") ?? undefined,
            referrer: String(body.referrer ?? "").slice(0, 200) || undefined,
          }),
        );
        return new Response(null, { status: 204 });
      },
    },
  },
});
