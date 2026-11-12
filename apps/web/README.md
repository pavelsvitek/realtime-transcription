# Amie website prototype

Landing page translated from Paper: hero, word-by-word, speaker ID (Zoom Color lock), meeting summary (full Amie window, Summary tab), then a scroll-driven Local MCP data-flow in Claude Cowork (two queries: roadmap meetings, then decisions).

Cast and meeting copy live in [`docs/brand/website-conversation.md`](../../docs/brand/website-conversation.md) and [`src/data/roadmap-cut.ts`](src/data/roadmap-cut.ts). Keep those in sync.

Built with [TanStack Start](https://tanstack.com/start) (Vite, file-based routes in `src/routes`), Tailwind v4, and deployed to Cloudflare Workers via `@cloudflare/vite-plugin`.

## Develop

```bash
pnpm --filter web dev
```

Open [http://localhost:3001](http://localhost:3001).

| Script           | What it does                                              |
| ---------------- | --------------------------------------------------------- |
| `pnpm dev`       | Vite dev server (runs in the Workers runtime)             |
| `pnpm build`     | Production build + prerender of static pages to `dist/`   |
| `pnpm preview`   | Serve the built Worker locally                            |
| `pnpm deploy`    | Build, then `wrangler deploy`                             |
| `pnpm typecheck` | `tsc --noEmit`                                            |
| `pnpm lint`      | ESLint                                                    |

## Deploy to Cloudflare

1. `pnpm --filter web exec wrangler login` (once).
2. `pnpm --filter web deploy`. The Worker is named `amie-web` (see `wrangler.jsonc`).
3. Attach a custom domain in the Cloudflare dashboard (Workers & Pages → amie-web → Settings → Domains) or add a `routes` entry to `wrangler.jsonc`.

The home page is prerendered at build time and served as a static asset; the Worker handles anything else.

## Environment and secrets

The site needs none today. See [`env.example`](env.example) for how to add them (`.dev.vars` locally, `wrangler secret put` in production; never `VITE_`-prefixed for secrets).
