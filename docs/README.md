# Documentation

Product and feature documentation for the realtime transcription app — a **live conversation copilot** that transcribes device audio in real time and surfaces structured AI suggestions during a call.

This is not a passive transcript viewer or generic chat assistant. The product helps the user perform better in live conversations (interviews, discovery calls, brainstorming) and preserves session state for post-call review.

## Contents

- [Product Overview](./product-overview.md) — purpose, user jobs, high-level flow, domain concepts, and product principles
- [Developer Instructions](./instructions.md) — rebuild steps for Swift helper, tests, golden eval
- [Entity API naming](./technical/entity-api-naming.md) — React/Rust CRUD verbs (`getAll` / `get` / `patch` / `delete`)
- [xAI Transcribe 2.0](./technical/xai-speech-to-text.md) — dual-backend WebSocket STT alongside local Nemotron
- [NOTSOFAR eval-small](./eval/dataset-notsofar.md) — local ASR WER on 10 far-field meetings
- [Feature Specs](./features/README.md) — detailed UX and behavior specs
  - [Live Suggestion Cards](./features/live-suggestion-cards.md) — card layout, item lifecycle, generation rules, and state preservation

## At a glance

**Typical sessions:** customer interview, user research, product brainstorming, discovery call, sales conversation, needs extraction.

**Session flow:**

1. User starts a session and selects a mode (e.g. `customer interview`, `product brainstorming`, `needs extraction`)
2. App captures device audio input and output and produces a real-time transcript
3. Recent transcript windows plus session context are sent to an LLM
4. The LLM generates mode-specific suggestions as structured card items
5. User finishes the session explicitly; state is preserved for post-call breakdown

**Live UI model:** stable layout, dynamic content.

- Transcript panel on the right (~25% width) — supporting context
- Fixed 2×2 grid of suggestion cards in the main area — primary action surface
- Card identities and positions stay stable; items inside cards update continuously

## Core concepts

| Concept | Description |
| --- | --- |
| Session | User-initiated live conversation with explicit start and finish |
| Mode | Predefined conversational lens that defines which cards appear |
| Transcript | Real-time text from device audio input and output |
| Card | Fixed-purpose container for one category of live assistance |
| Item | Single suggestion or observation inside a card |
| Rationale | Short text explaining why an item appeared |
| Post-call breakdown | Future review experience built from preserved session state |

## Product principles

- **Live help, not distraction** — scannable suggestions the user can absorb in seconds
- **Stable layout, dynamic content** — cards stay in place; content inside them changes
- **Append, revise, or silence** — the LLM should avoid noise and near-duplicate suggestions
- **Session-scoped state** — dismissals, pins, and done marks are meaningful product signals, not ephemeral UI events
- **Transcript supports; cards act** — the transcript is context; cards are the operating surface

## Status

| Documented | Not yet specified |
| --- | --- |
| Product vision and domain model | Remaining application implementation |
| Live suggestion cards UX and behavior | LLM integration details |
| Nemotron audio capture and transcription pipeline | Post-call breakdown experience |
| Item lifecycle, dedupe, and state preservation | |

When building from these specs, prefer designs that make the live conversation easier rather than more feature-rich. See [Product Overview](./product-overview.md) for full guidance.
