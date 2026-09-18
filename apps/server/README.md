# server

Cloudflare Workers API for the realtime transcription workspace, implemented with [Hono](https://hono.dev/). Routes are empty for now.

## Development

From the repo root:

```bash
pnpm install
pnpm dev:server
```

Or from this package:

```bash
pnpm dev
```

## Deploy

```bash
pnpm deploy:server
```

Generate Worker binding types after changing `wrangler.jsonc`:

```bash
pnpm --filter server cf-typegen
```
