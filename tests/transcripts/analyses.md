# Transcript window analysis

Analysis of the customer-interview meeting copilot fixtures to determine how large a sliding conversation window should be when sending context to the LLM for live insight extraction (follow-up questions, customer needs, risks, topics).

**Fixtures:**

- [`customer-interview-meeting-copilot.json`](./customer-interview-meeting-copilot.json) — mock conversation
- [`customer-interview-meeting-copilot.stub-updates.json`](./customer-interview-meeting-copilot.stub-updates.json) — expected suggestion-card updates

## Conversation stats

| Metric | Value |
|--------|-------|
| Duration | 13.3 min (801 s) |
| Segments | 40 |
| Total words | ~1,223 |
| Avg segment duration | ~18.6 s |
| Avg words per segment | ~31 |

## What the stub file does

The stub file defines **15 triggers**, each firing `afterSegmentId` on a **customer answer**. Every trigger produces short card items (append ops) with rationales that quote:

- the triggering customer segment, or
- the **PM question + customer answer** pair immediately before it.

Insights are grounded in the **last 1–2 exchanges**, not the full interview.

### Example mappings

| Trigger | Insight source | Words needed |
|---------|----------------|--------------|
| `seg-006` | Customer lists spreadsheet + onboarding pains | ~58w (1 segment) |
| `seg-008` | "Lost the follow-up thread… twenty minutes later" | Q+A pair (~90w) |
| `seg-010` | Tuesday approval bottleneck + spreadsheet (same missed call) | Q+A pair (~90w) |
| `seg-014` | Four pains in one long answer | Q+A pair (~110w) |
| `seg-018` | Reaction to product pitch in `seg-017` | Q+A pair (~130w) |

### Trigger cadence

| Trigger | Gap since previous |
|---------|-------------------|
| `seg-006` | 91s (first) |
| `seg-008` | 36s |
| `seg-010` | 34s |
| `seg-012` | 30s |
| `seg-014` | 44s |
| `seg-016` | 44s |
| `seg-018` | 62s |
| `seg-020` | 44s |
| `seg-022` | 36s |
| `seg-024` | 50s |
| `seg-026` | 42s |
| `seg-030` | 94s |
| `seg-034` | 90s |
| `seg-036` | 34s |
| `seg-038` | 48s |

**Average gap:** ~52s between triggers (range 30–94s).

## Window size comparison

Measured at each trigger: how many segments and words fall within a time-based lookback ending at the trigger segment.

### Words in window by duration

| Trigger | 60s | 90s | 120s | 180s |
|---------|-----|-----|------|------|
| `seg-006` | 3seg / 136w | 6seg / 219w | 6seg / 219w | 6seg / 219w |
| `seg-008` | 3seg / 125w | 5seg / 203w | 8seg / 286w | 8seg / 286w |
| `seg-010` | 3seg / 125w | 5seg / 201w | 7seg / 279w | 10seg / 362w |
| `seg-012` | 4seg / 120w | 5seg / 169w | 7seg / 245w | 11seg / 368w |
| `seg-014` | 3seg / 125w | 5seg / 190w | 7seg / 260w | 10seg / 350w |
| `seg-016` | 3seg / 133w | 5seg / 179w | 7seg / 244w | 10seg / 332w |
| `seg-018` | 2seg / 109w | 3seg / 149w | 5seg / 242w | 8seg / 298w |
| `seg-020` | 3seg / 101w | 4seg / 168w | 5seg / 208w | 7seg / 301w |
| `seg-022` | 3seg / 86w | 5seg / 139w | 6seg / 206w | 8seg / 260w |
| `seg-024` | 3seg / 79w | 5seg / 142w | 6seg / 153w | 8seg / 262w |
| `seg-026` | 3seg / 107w | 4seg / 121w | 6seg / 159w | 9seg / 260w |
| `seg-030` | 3seg / 91w | 4seg / 101w | 5seg / 155w | 8seg / 222w |
| `seg-034` | 3seg / 94w | 4seg / 101w | 5seg / 153w | 8seg / 202w |
| `seg-036` | 3seg / 91w | 5seg / 152w | 6seg / 159w | 9seg / 250w |
| `seg-038` | 3seg / 97w | 5seg / 141w | 6seg / 152w | 9seg / 261w |

### Estimated transcript tokens at 120s

~1.3 tokens per English word (transcript text only):

| Trigger | Words | ~Tokens |
|---------|-------|---------|
| `seg-006` | 219 | 285 |
| `seg-008` | 286 | 372 |
| `seg-010` | 279 | 363 |
| `seg-012` | 245 | 319 |
| `seg-014` | 260 | 338 |
| `seg-016` | 244 | 317 |
| `seg-018` | 242 | 315 |
| `seg-020` | 208 | 270 |
| `seg-022` | 206 | 268 |
| `seg-024` | 153 | 199 |
| `seg-026` | 159 | 207 |
| `seg-030` | 155 | 202 |
| `seg-034` | 153 | 199 |
| `seg-036` | 159 | 207 |
| `seg-038` | 152 | 198 |

**Range at 120s:** ~200–370 transcript tokens per call.

### Coverage check (PM question + customer answer)

For all 15 triggers, the minimum source set is the PM question segment and the triggering customer answer (`seg-N-1` + `seg-N`). Both **60s**, **90s**, and **120s** windows include that pair at every trigger. A 60s window is tight for `seg-017`/`seg-018` (product pitch barely fits).

### Segment-count alternative

| Segments | Typical span | Words at triggers |
|----------|--------------|-------------------|
| 2 (Q+A) | 55–79s | 79–133w — enough for literal extraction |
| 4 | 69–105s | 94–168w — adds one prior exchange |
| 6 | 91–141s | 152–242w — matches most rationales |
| 8 | 127–185s | 202–309w — diminishing returns vs 6 |

## Summary by window size

| Window | Typical content | Transcript tokens | Fits all 15 stubs? |
|--------|-----------------|-------------------|-------------------|
| **60s** | 2–3 segments | ~110–175 | Yes (barely) |
| **90s** | 3–5 segments | ~150–190 | Yes, comfortably |
| **120s** | 5–7 segments | ~200–370 | Yes, with prior topic context |
| **180s** (current code) | 7–11 segments | ~260–370 | Yes, but 3–5 extra segments the stubs never use |

## Recommendation

### Primary sliding window

**120 seconds** or **last 6 finalized segments** — whichever yields more text.

This provides:

- ~5–7 turns of dialogue
- ~200–350 transcript tokens
- The PM question, the customer answer that triggered generation, and one prior exchange for local context

This matches how the participant describes the problem in `seg-008`: losing threads **during the call** while the conversation moves on — not failing to recall something from ten minutes earlier. The stub insights surface while threads are still warm (30–90s gaps between triggers).

### What to send besides the window

These belong in the LLM prompt as **session state**, not inside the sliding transcript window:

- **Mode + session setup** — goal, participant segment, hypothesis (`seg-028`: generic suggestions without context are useless)
- **Active items per card** — for revise vs append and semantic dedupe
- **Discarded/suppressed topics** — prevent re-suggesting dismissed themes (`seg-022`: repeated near-duplicates are worse than silence)

### Generation cadence

- Call the LLM on **segment finalization** (or debounce ~15–20s after speech ends), not on every partial.
- With ~52s average between meaningful updates, a 120s window overlaps the previous call by ~60–70s — useful for continuity and dedupe without sending the full interview.

### Current implementation

`RECENT_TRANSCRIPT_MS = 180_000` in `web/src/lib/session/active-session.ts` is safe but ~50% wider than this fixture requires. Example: at `seg-010`, 180s sends 10 segments / 362 words vs 7 / 279 at 120s — extra context that does not improve stub insights and increases noise risk (`seg-020`: repeated bullets and rephrased suggestions are explicit turn-offs).

### When more than 120s is needed

Not demonstrated in these stubs. Long-range recall should use a **second layer**, not a larger raw window:

- Returning to a topic after 5+ minutes ("you mentioned spreadsheets earlier…")
- End-of-call synthesis (`seg-038`-style prioritization across themes)
- Cross-interview patterns

For that: a **rolling session summary** (~200 tokens, updated every ~5 min) plus pinned/active card state.

Enterprise sales calls with longer monologues may justify **180s / 8 segments** as a ceiling; this customer-interview fixture supports **120s / 6 segments** as the default.

## Practical spec

```
transcript_window = max(
  last 120 seconds of finalized speech,
  last 6 finalized segments
)
+ session_context (mode, goal, hypothesis)
+ active_card_items (all non-discarded)
+ suppressed_topics (discarded items)
```

**Total transcript budget per LLM call:** ~300–500 tokens for this interview style (~30 words/turn, turn-taking discovery calls).
