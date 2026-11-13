/** Fire-and-forget product event; lands in Workers Observability via /api/track. */
export function track(event: "download_click" | "download_unsupported", props: Record<string, string>) {
  try {
    const body = JSON.stringify({ event, referrer: document.referrer, ...props });
    // Survives the page navigating to the DMG straight after the click.
    fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Analytics must never break the download.
  }
}
