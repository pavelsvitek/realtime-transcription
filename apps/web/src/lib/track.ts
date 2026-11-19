declare global {
  interface Window {
    gtag?: (command: "event", name: string, params?: Record<string, unknown>) => void;
  }
}

type TrackEvent = "download_click" | "download_unsupported";

/**
 * Fire-and-forget product event. Every event lands in Workers Observability via
 * /api/track; it is also sent to GA4 (gtag in routes/__root.tsx), where
 * `download_click` is the key event imported into Google Ads as a conversion.
 */
export function track(event: TrackEvent, props: Record<string, string>) {
  try {
    const body = JSON.stringify({ event, referrer: document.referrer, ...props });
    // Survives the page navigating to the DMG straight after the click.
    fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never break the download.
  }
  try {
    window.gtag?.("event", event, { ...props, transport_type: "beacon" });
  } catch {
    // Same: an ad blocker or a broken tag must not block the download.
  }
}
