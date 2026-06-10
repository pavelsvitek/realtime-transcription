# Live Suggestion Cards

## Summary

During a live session, the user selects a clear mode such as `customer interview`.
That mode defines a fixed set of suggestion cards shown in the main area of the app.
Each card behaves as a live, scrollable stream of AI-generated items tied to a single purpose, such as follow-up questions or detected needs.

The transcript is shown in a right-side panel and acts as supporting context for the live cards.

## Goals

- Help the user stay focused during a live call or interview.
- Keep AI output organized into stable, easy-to-scan categories.
- Continuously surface useful next steps without rewriting the whole UI.
- Preserve the full state of card activity for post-call breakdown and review.

## Layout

### Screen structure

- The transcript is displayed in a right-side panel.
- The transcript panel takes roughly 25% of the screen width.
- The main screen area contains live suggestion cards.

### Card grid

- Show up to 4 cards on screen at once.
- Arrange cards in a 2x2 grid.
- Card positions remain stable during the live session.
- The selected mode defines which cards appear.

## Card Model

Each card has a fixed purpose for the duration of the session.

Example card types for `customer interview` mode:

- `Follow-up questions`
- `Customer needs`
- `Risks or objections`
- `Topics to explore`

The card itself is stable. The list of items inside the card is dynamic.

## Item Model

Each item is a single suggestion or observation.

Examples:

- `Ask what they tried before and why it failed`
- `Pain seems frequent, but frequency is still unconfirmed`

Each item may include:

- Primary text
- Short rationale text derived from recent transcript context
- Timestamp or recency context if needed later
- Status metadata for session and post-call flows

## Rationale Text

Each item should include a very short explanation for why it appeared.

Rules:

- Keep rationale to 1-2 short sentences.
- Show it as small supporting text under the item.
- Prefer concrete references to recent conversational context.

Examples:

- `They mentioned manual workarounds twice.`
- `Budget concern was implied in the last minute.`
- `You still do not know how often this happens.`

## Card Behavior

### Live stream behavior

- New items appear at the bottom of the card.
- Older items move upward as newer items are added.
- Older items should visually fade toward the top.
- The card scrolls smoothly.
- The newest content lives at the bottom of the scrollable list.

### Auto-scroll

- Cards auto-scroll to newly added items while the user is in live mode.
- If the user manually scrolls up, auto-scroll should pause.
- While paused, new items should continue arriving in the list without yanking the user's view.
- Show a lightweight indicator such as `Back to live` or `3 new`.
- Auto-scroll resumes when the user returns to the bottom.

### Item capacity

- Show a maximum of 4-5 items visibly within a card at one time.
- Keep no more than 10 items in the card list at once.
- Once the list reaches 10 items, older items should roll out of the visible live list according to retention rules.

## Generation Rules

For each card, the AI should choose among these actions:

- `Append`: add a genuinely new idea as a new item.
- `Revise`: update an existing item when the same thread becomes sharper.
- `Do nothing`: avoid adding noise when there is no meaningful update.

### Append

Use append when:

- The idea is meaningfully new.
- It opens a new thread worth exploring.
- It is not a near-duplicate of a visible or recently dismissed item.

### Revise

Use revise when:

- The item reflects the same underlying suggestion.
- New transcript context makes the suggestion more precise.
- The user would benefit more from a sharper version than from a second similar item.

### Do nothing

Use do nothing when:

- The update would produce repetition or churn.
- The new signal is too weak.
- The content is already represented well enough by an existing item.

## Item Actions During Live Session

Each live item supports these actions:

- `Discard`
- `Pin`
- `Mark as done`

### Discard

- Removes the item from the visible card immediately.
- The item is considered discarded for the current conversation.
- Discarded items must still be preserved in session state for dedupe and post-call analysis.

### Pin

- Marks the item as important for later review.
- Pinned items should be available in the post-call breakdown.

### Mark as done

- Marks the item as acted on or completed during the call.
- Done items should be available in the post-call breakdown.

## Dismissal, Resurfacing, and Dedupe

Discarded items are conversation-scoped.

Rules:

- Store discarded items in per-conversation memory.
- AI generation should check new items against discarded items semantically, not only by exact text.
- An item may reappear later if new transcript context makes it relevant again.
- If the same underlying item has been discarded more than 2 times, do not resurface it again unless there is substantial new evidence.

The goal is to avoid churn while still allowing genuinely renewed relevance.

## Item Lifecycle

Suggested lifecycle:

1. `Generated`
2. `Revised` or left unchanged
3. `Discarded`, `Pinned`, or `Done`
4. `Resurfaced` if later context justifies it
5. Preserved for post-call breakdown

## State Preservation

The full state of cards and items must be preserved for the duration of the conversation and after explicit session finish.

This includes:

- Card identity and mode
- Visible live items
- Revised item history if tracked
- Discarded items
- Pinned items
- Done items
- Resurfaced items
- Rationale text
- Ordering and timestamps if available

The end of the session is triggered explicitly by the user.

## Post-Call Requirement

Post-call breakdown will be specified later, but the live session system must preserve enough structured state to support it.

At minimum, post-call flows must be able to reconstruct:

- What appeared during the session
- What the user discarded
- What the user pinned
- What the user marked as done
- Which items resurfaced after earlier dismissal

## Constraints

- Avoid near-duplicate suggestions.
- Avoid rapid visual churn.
- Keep the card experience scannable during a live conversation.
- Preserve smooth motion and stable spatial layout.
- Prefer short, actionable item text over verbose assistant-style responses.

## Open Questions

- What exact retention rule should apply when a card exceeds 10 items?
- Should pinned or done items remain in the live card list, or move into a separate session tray?
- Should revised items visibly show that they changed?
- Should rationale text always be shown, or only on hover/expand in denser layouts?
