# Realtime Transcription

pnpm workspace for a real-time transcription product: a local macOS desktop app, a web prototype, and a Cloudflare API.

## Apps

| Package | Path | Role |
| --- | --- | --- |
| `tauri-app` | [`apps/tauri-app`](./apps/tauri-app) | Local macOS transcription app (Tauri + React) |
| `web` | [`apps/web`](./apps/web) | Next.js suggestion-card prototype |
| `server` | [`apps/server`](./apps/server) | Cloudflare Workers API (Hono) — routes not added yet |

## Setup

Requires [pnpm](https://pnpm.io/) 10 (this repo pins `pnpm@10.33.0`).

```bash
pnpm install
```

## Development

From the repo root:

```bash
pnpm dev:desktop   # Tauri desktop app
pnpm dev:web       # Next.js prototype
pnpm dev:server    # Cloudflare Worker (wrangler)
```

Desktop setup (Nemotron helper, permissions, golden eval) lives in [`apps/tauri-app/README.md`](./apps/tauri-app/README.md).

## Docs

- [Model Investigation](./MODEL_INVESTIGATION.md) — Nemotron runtime, trade-offs, and evaluation requirements
- [Product Docs](./docs/README.md) — product vision, feature specs, and technical notes
