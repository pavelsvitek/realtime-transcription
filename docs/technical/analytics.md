# Usage analytics

Amie sends anonymous usage analytics to a self-hosted [Flareboard](https://github.com/Go7hic/flareboard) running on our Cloudflare account. It is **on by default** and the user can turn it off in **Settings → Privacy**. The [privacy policy](../../apps/web/src/routes/privacy.tsx) (section "Usage analytics") describes it for users; keep the two in sync.

Code: [`apps/amie/src-tauri/src/analytics/`](../../apps/amie/src-tauri/src/analytics/).

## What is sent

Every item carries the install id (`id`), `release` (app version), `os` (`macOS 15.1`), `browser: "Amie"`, `device: "desktop"`, `hostname: "amie-desktop"` and `environment`. Flareboard adds the **country** from Cloudflare's request data and does not store the IP.

| Event | When | `data` |
| --- | --- | --- |
| `identify` (type) | First send, and again when app version / macOS / arch change | `app_version`, `os_version`, `arch` |
| `app_active` | At most once per UTC day while the app runs | — |
| `meeting_ended` | When a recording stops | `duration_s`, `meeting_app`, `meeting_app_bundle`, `browser`, `remote_speakers`, `audio_source`, `asr_backend`, `has_context` |
| `mcp_usage` | Once per finished UTC day, per MCP client and tool | `day`, `mcp_client`, `tool`, `calls`, `errors` |

Every event also has `app_version` in `data`, so it can be used in breakdowns.

**Never sent:** audio, transcripts, summaries, titles, context text, participant names, MCP tool arguments or results.

### Field notes

- **Install id.** Random UUID in `~/Library/Application Support/com.pavel.amie/analytics.json`. It is not the sync `device_id`. Turning analytics off deletes it and the unsent queue. Turning analytics back on creates a new id.
- **`meeting_app` / `meeting_app_bundle`.** While recording, Amie asks Core Audio every 10 s which processes are capturing from a microphone (process objects, macOS 14.2+). The app seen in the most polls wins. Amie itself and dictation/Siri daemons are ignored, and helper processes fold into their app (`com.google.Chrome.helper` → `com.google.Chrome`). The bundle id is always sent, so unmapped apps still show up. `meeting_app` is a short name for known apps (`zoom`, `teams`, `webex`, `slack`, `facetime`, `discord`, `whatsapp`, …). A browser counts as `google_meet` when the Amie Meet extension reported a live call, otherwise as `browser`. If nothing is found, the value is `other` for an unknown app, the running Zoom/Teams as a fallback, or `none`. The mapping lives in [`meeting_app.rs`](../../apps/amie/src-tauri/src/analytics/meeting_app.rs).
- **`remote_speakers`** is the number of distinct remote names the meeting app marked as *speaking*. It is not the size of the roster, and it is only present when system audio is captured. Zoom and Teams report it through Accessibility, and Google Meet through the extension. People who never spoke are not counted.
- **MCP.** The `amie_mcp` process counts calls in `analytics.db` (only tool names it serves, and the client name from MCP `initialize`, normalized: `Claude Code` → `claude-code`). It never makes network requests; the app sends finished days.

## How it flows

```
amie (app)  ──track()──▶ analytics.db ◀──count── amie_mcp
     │                       │
     └─ uploader: 60 s after launch, then every 6 h
             └─ POST {AMIE_ANALYTICS_HOST}/api/batch   (≤ 50 items per request)
```

- The queue is capped at 2,000 events, and the oldest are dropped first.
- On a network error or a non‑2xx response, the queue is kept for the next attempt. Flareboard honors client timestamps up to 90 days old.
- A 2xx response clears the batch. Items Flareboard rejected are logged (`analytics: Flareboard rejected some items`).
- The User-Agent is `Amie/<version> (Macintosh; macOS <version>)`, so Flareboard's bot filter does not drop requests as a generic HTTP client.

## Configuration

The endpoint is baked in at build time:

| Variable | Where | Example |
| --- | --- | --- |
| `AMIE_ANALYTICS_HOST` | GitHub **repository variable** (not a secret, it ships in the app) | `https://ingest.<your-domain>` |
| `AMIE_ANALYTICS_WEBSITE_ID` | GitHub **repository variable** | Flareboard website UUID |

[`amie-release.yml`](../../.github/workflows/amie-release.yml) passes both to the build. Without them, a build records and sends nothing, and Settings shows "Off in this build". Local and dev builds therefore send nothing unless you set the variables.

At runtime:

- `AMIE_ANALYTICS_HOST` / `AMIE_ANALYTICS_WEBSITE_ID` override the built-in values. Use this to point a dev build at a test Flareboard.
- `AMIE_ANALYTICS_DISABLED=1` turns analytics off regardless of the setting.

## Hosting Flareboard on Cloudflare

> **License first.** Flareboard (apart from its MIT browser SDK) is under the **PolyForm Noncommercial 1.0.0** license. Running it for Amie may count as commercial use. Get written permission from the author, or confirm Amie's use qualifies as noncommercial, before deploying it for production data.

Flareboard is a pnpm monorepo of Workers (`apps/ingest`, `apps/api`, `workers/aggregator`) plus a React dashboard. It uses D1, KV, R2, Queues and Durable Objects. Its own guide is [`docs/deployment.md`](https://github.com/Go7hic/flareboard/blob/main/docs/deployment.md), and that guide is the source of truth for resource names and secrets.

Using the [Cloudflare CLI (`cf`)](https://developers.cloudflare.com/cf/) (beta):

1. Fork Flareboard and install it: `pnpm install`.
2. Sign in: `npm install --global cf`, then `cf auth login`.
3. Create the D1 database, KV namespace, R2 bucket and Queue that Flareboard's `wrangler.jsonc` files bind to, under your own names. Then replace the IDs in each app's `wrangler.jsonc`, as its deployment guide says.
4. Flareboard ships Wrangler configs, so convert each Worker project once: `cf migrate` (in `apps/ingest`, `apps/api`, `workers/aggregator`).
5. Apply migrations (`pnpm db:migrate` against the remote database) and set the secrets from each app's `.dev.vars.example`.
6. Deploy each Worker: `cf deploy` (check first with `cf deploy --dry-run`). Deploy the dashboard as its guide describes.
7. Put the ingest Worker on its own hostname (e.g. `ingest.<your-domain>`). Amie talks to it directly, **not** through `apps/server`, because Flareboard reads the country from the request, and a Worker-to-Worker hop would report the Worker's location instead of the user's.
8. In the Flareboard dashboard, create a website for "Amie app". Use its UUID as `AMIE_ANALYTICS_WEBSITE_ID` and the ingest origin as `AMIE_ANALYTICS_HOST`.
9. Set the analytics retention in Flareboard, and fill the `ANALYTICS RETENTION PERIOD` placeholder in the privacy policy with the same value.

For CI deploys, `cf` reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` ([Use cf in CI](https://developers.cloudflare.com/cf/ci/)).

## Testing locally

```bash
AMIE_ANALYTICS_HOST=http://localhost:8787 \
AMIE_ANALYTICS_WEBSITE_ID=<website uuid from your local Flareboard> \
RUST_LOG=amie_lib::analytics=debug pnpm dev:desktop
```

The first send happens 60 s after launch. Unit tests (`cargo test --lib analytics`) cover the queue, opt-out, payload shape and a full flush against a mock server.

## Useful Flareboard views

- **Active installs / retention:** `app_active` events, unique `id`, retention by week.
- **Meetings per install, median length:** `meeting_ended` count and `duration_s` broken down by `app_version`.
- **Meeting software:** `meeting_ended` broken down by `meeting_app`. Look at `meeting_app_bundle` where `meeting_app = other` to decide which apps to map next.
- **Countries:** the built-in geo breakdown.
- **MCP adoption:** `mcp_usage` unique installs and sum of `calls`, broken down by `mcp_client` and `tool`.
