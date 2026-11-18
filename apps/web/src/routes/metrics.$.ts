import { createFileRoute } from "@tanstack/react-router";

/**
 * First-party reverse proxy for Google Tag Manager / GA4, so ad blockers that
 * match on google domains don't drop the scripts or the collect calls.
 *
 *   /metrics/gtm.js    -> googletagmanager.com/gtm.js
 *   /metrics/gtag/js   -> googletagmanager.com/gtag/js
 *   /metrics/g/collect -> google-analytics.com/g/collect
 *
 * GA4 must be told to send hits here: in GTM set the Google tag's
 * `server_container_url` (a.k.a. transport_url) to https://<site>/metrics.
 */
const UPSTREAMS: Record<string, string> = {
  "gtm.js": "https://www.googletagmanager.com/gtm.js",
  "gtag/js": "https://www.googletagmanager.com/gtag/js",
  "g/collect": "https://www.google-analytics.com/g/collect",
};

async function proxy({ request, params }: { request: Request; params: { _splat?: string } }) {
  const upstream = UPSTREAMS[params._splat ?? ""];
  if (!upstream) return new Response(null, { status: 404 });

  const incoming = new URL(request.url);
  const headers = new Headers();
  for (const name of ["user-agent", "content-type", "accept", "accept-language", "referer"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // Keep GA's geo/IP attribution pointing at the visitor, not at Cloudflare.
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) headers.set("x-forwarded-for", ip);

  const hasBody = request.method === "POST";
  const res = await fetch(upstream + incoming.search, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });

  const out = new Headers();
  for (const name of ["content-type", "cache-control", "expires"]) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(res.body, { status: res.status, headers: out });
}

export const Route = createFileRoute("/metrics/$")({
  server: { handlers: { GET: proxy, POST: proxy } },
});
