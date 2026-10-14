# Amie website prototype

Landing page translated from Paper: hero, word-by-word, speaker ID (Zoom Color lock), meeting summary (full Amie window, Summary tab), then a scroll-driven Local MCP data-flow in Claude Cowork (two queries: roadmap meetings, then decisions).

Cast and meeting copy live in [`docs/brand/website-conversation.md`](../../docs/brand/website-conversation.md) and [`src/data/roadmap-cut.ts`](src/data/roadmap-cut.ts). Keep those in sync.

```bash
pnpm --filter web-prototype dev
```

Open [http://localhost:3001](http://localhost:3001).
