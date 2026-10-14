# Realtime Transcription

pnpm workspace for a real-time transcription product: a local macOS desktop app, a web prototype, and a Cloudflare API.

## Apps

| Package | Path | Role |
| --- | --- | --- |
| `amie` | [`apps/amie`](./apps/amie) | Local macOS transcription app (Tauri + React) |
| `web` | [`apps/web`](./apps/web) | Next.js suggestion-card prototype |
| `web-prototype` | [`apps/web-prototype`](./apps/web-prototype) | Marketing landing (Paper → React) |
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
pnpm dev:web-prototype  # Marketing landing (localhost:3001)
pnpm dev:server    # Cloudflare Worker (wrangler)
```

Desktop setup (Nemotron helper, permissions, golden eval) lives in [`apps/amie/README.md`](./apps/amie/README.md).

## Docs

- [Model Investigation](./MODEL_INVESTIGATION.md) — Nemotron runtime, trade-offs, and evaluation requirements
- [Product Docs](./docs/README.md) — product vision, feature specs, and technical notes
