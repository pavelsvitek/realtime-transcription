import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { parseRangeDays, queryDashboardMetrics } from "@/lib/queries";

export const Route = createFileRoute("/api/metrics")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const days = parseRangeDays(url.searchParams.get("days"));
        const version = url.searchParams.get("version") ?? "all";
        try {
          const metrics = await queryDashboardMetrics(env.TELEMETRY_DB, days, version);
          return new Response(JSON.stringify(metrics), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          });
        } catch (err) {
          console.error("Failed to query dashboard metrics", err);
          return new Response(JSON.stringify({ error: "Failed to load metrics" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
