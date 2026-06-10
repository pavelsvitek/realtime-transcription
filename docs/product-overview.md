# Product Overview

## Purpose

This product listens to device audio input and output, transcribes the audio in real time, and uses the evolving transcript to generate live AI assistance during a conversation.

The core use case is not passive transcription. The product is a live conversation copilot.

It helps the user:

- ask better follow-up questions
- notice important themes while a conversation is still happening
- identify missing information
- explore better interview or brainstorming directions
- capture useful signals for post-call review

## Core Product Idea

The user is in a live conversation such as a customer interview, discovery call, or brainstorming session.

While the conversation is happening:

1. audio is transcribed in real time
2. recent transcript windows are sent to an LLM together with session context
3. the LLM generates mode-specific suggestions
4. the suggestions are presented in structured live cards
5. the user stays focused on the conversation and uses the cards as lightweight guidance

The product should feel like a calm, real-time coach rather than a chat window.

## Primary User Jobs

The product helps the user do these jobs during a call:

- keep track of what has already been said
- discover which topic is worth exploring next
- identify gaps in understanding
- ask sharper follow-up questions
- recognize needs, objections, pain points, and opportunities
- avoid losing important ideas in fast-moving conversations

The product also helps after the call by preserving structured session state for later breakdown and analysis.

## Typical Use Cases

Examples of sessions the product should support:

- customer interview
- user research interview
- product brainstorming
- discovery call
- sales conversation
- customer needs extraction

Each use case may require a different mode with different suggestion cards.

## High-Level Flow

### 1. Start session

The user explicitly starts a conversation session and chooses a mode.

Examples:

- `customer interview`
- `product brainstorming`
- `needs extraction`

The selected mode defines the fixed set of cards shown during the live session.

### 2. Capture and transcribe

The app listens to device audio input and output and produces a real-time transcript.

The transcript is a live source of truth for what has been said.

### 3. Generate live suggestions

The system sends recent transcript context, plus user-selected session context, to an LLM.

Additional context may include:

- the current mode
- interview or meeting goal
- user intent
- product or business context
- desired extraction lens such as customer needs or objections

The LLM should not generate generic chat responses. It should generate structured, mode-aware suggestions.

### 4. Support the live conversation

The UI shows:

- a transcript panel on the right
- a fixed grid of live suggestion cards in the main area

The transcript supports understanding.
The cards support action.

### 5. Finish session explicitly

The live session ends only when the user explicitly finishes it.

At that point, the system must preserve enough state to support later post-call review and breakdown.

## UX Model

The product is built around a stable-layout, live-update model.

### Stable structures

These should remain stable during a session:

- selected mode
- card identities
- card positions on screen
- transcript panel location

### Dynamic structures

These should update continuously:

- transcript content
- items inside each card
- rationale text tied to recent transcript context
- item states such as discarded, pinned, and done

The user should build muscle memory around where to look for each kind of help.

## Live Suggestion Cards

Cards are the main operating surface of the product during a conversation.

Each card represents one type of help, such as:

- follow-up questions
- customer needs
- risks or objections
- topics to explore

Cards are fixed by mode, but items inside them update in real time.

Each item is a short suggestion or observation, with a short rationale underneath explaining why it appeared.

Important behavior:

- new items appear at the bottom
- older items move upward
- the list scrolls smoothly
- the newest content lives at the bottom
- items can be discarded, pinned, or marked as done
- dismissed items are removed visually but still preserved in session state

For the detailed behavior spec, see [Live Suggestion Cards](./features/live-suggestion-cards.md).

## What the LLM Is Expected To Do

The LLM is not a generic assistant in this product.

Its job is to:

- interpret the recent transcript in the context of the selected mode
- detect useful conversational signals
- decide whether to append a new item, revise an existing item, or do nothing
- avoid noise and near-duplicate suggestions
- produce short, actionable text
- explain each suggestion with a very short rationale

The LLM should often choose silence if no meaningful update is needed.

## Key Product Principles

### 1. Live help, not distraction

The product should improve the user's performance during a real conversation without forcing them to manage a noisy interface.

### 2. Stable layout, dynamic content

Cards should stay in place. The content inside cards may change.

### 3. Short and actionable beats verbose

The user should be able to scan suggestions in seconds.

### 4. Conversation context is session-scoped

Suggestions, dismissals, pins, and done states belong to the current conversation session.

### 5. Preserve state for later synthesis

Even if something disappears from the live view, the system should keep enough structured state to support post-call breakdown.

### 6. Avoid churn

The product should prefer:

- append when there is a new thought
- revise when the same thought becomes sharper
- do nothing when the update would only create noise

## Core Domain Concepts

These concepts should remain consistent across product, design, and implementation work.

### Session

A user-initiated live conversation with explicit start and explicit finish.

### Mode

A predefined conversational lens that determines what kinds of cards and suggestions are shown.

### Transcript

The real-time textual representation of device audio input and output during a session.

### Card

A fixed-purpose container for one category of live assistance.

### Item

A single live suggestion or observation inside a card.

### Rationale

Short supporting text explaining why an item appeared.

### Item state

The per-item status during a conversation, such as visible, discarded, pinned, done, or resurfaced.

### Post-call breakdown

A later review experience built from preserved session state after the user explicitly finishes the session.

## Product Boundaries

This product is currently centered on:

- live transcription
- real-time LLM guidance
- structured card-based assistance
- state preservation for later analysis

It is not primarily:

- a generic chat assistant
- a meeting bot that dominates the conversation
- a static note-taking app
- a transcript viewer with occasional AI summaries

## Implementation Guidance For Future Agents

When building this product, preserve these assumptions unless a newer spec overrides them:

- the app is real-time and session-based
- the live user experience matters as much as raw model quality
- modes define the card structure
- transcript is supporting context, not the main action surface
- card behavior must resist duplication and churn
- item state must be preserved for post-call use
- user actions during the call are meaningful product signals, not temporary UI-only events

If there is uncertainty, prefer designs and implementations that make the live conversation easier rather than more feature-rich.
