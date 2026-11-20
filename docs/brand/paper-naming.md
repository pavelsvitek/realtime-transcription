# Paper naming codes

File: **Amie Website** (Paper). Every design is addressable by a short code.

- `P<n>` = page number. `P<n>C<m>` = container (artboard) `m` on page `n`. Example: `P3C4` is "B · Calm hero — Stage 1" on page 3.
- Codes are **stable**: never renumber. A new page takes the next free `P`, a new artboard the next free `C` on its page. A deleted code is retired, not reused.
- Page names read `P<n> <Area> - <label>`. Areas: `App` (screens of the Amie desktop app), `Web` (website), `Brand`, `Ads`.
- Artboard names read `P<n>C<m> <label>`. Section headers and "Label ·" banners carry no code.
- On `P3` a status marker follows the code: ✅ = implemented in the app, 🧪 = exploration (not built). The label banners above each row repeat the status.
- Only the `App` pages (P1–P3, P12, P13) have artboard codes so far. Add codes to the other pages when you first need to reference them.

## Pages

| Code | Page | Notes |
|---|---|---|
| P1 | App - Components (old) | Early Amie windows, meeting-app mockups, Twitter assets |
| P2 | App - Current UI | Every screen of the shipped app (P2C1–P2C48) |
| P3 | App - Home Variants (Stage 0–1) | Home exploration and the setup wizard |
| P4 | Web - Landing (old) | |
| P5 | Web - Landing · Brand colors | |
| P6 | Web - Benefit · Local MCP | |
| P7 | Web - Benefit · Speaker ID | |
| P8 | Web - Benefit · Meeting summary | |
| P9 | Brand - Color guidelines | |
| P10 | Ads - Demand Gen | |
| P11 | Ads - Winners | |
| P12 | App - Transcription idle variants | Pre-transcription (idle) Transcription page, P12C1–C5 |
| P13 | App - Pre-call Context variants | Context tab before the call; Summary tab disabled until the call ends, P13C1–C5 |

## P3 status

| Code | Design | Status |
|---|---|---|
| P3C1–C2 | A · Setup dashboard, Stage 0 / 1 | 🧪 exploration |
| P3C3 | B · Calm hero, Stage 0 | 🧪 exploration |
| P3C4 | B · Calm hero, Stage 1 | ✅ implemented (#65) |
| P3C5–C6 | C · First-meeting walkthrough, Stage 0 / 1 | 🧪 exploration |
| P3C7–C13 | B · Setup wizard, steps 0–6 | ✅ implemented (#67) |

## P12 status

| Code | Design | Status |
|---|---|---|
| P12C1 | A · Ready check (mic, call audio, model checklist + Start) | 🧪 exploration |
| P12C2 | B · Prep the meeting (title, people, context, up-next) | 🧪 exploration |
| P12C3 | C · Ghost transcript (preview rows behind a start card) | 🧪 exploration |
| P12C4 | D · Call detected (running Meet call + other start modes) | 🧪 exploration |
| P12C5 | E · Record stage (big Start button, source toggle, language) | 🧪 exploration |

## P13 status

All variants show the Summary tab locked with an "After the call" pill and the Context tab selected before the call.

| Code | Design | Status |
|---|---|---|
| P13C1 | A · Why it matters (three benefit cards above the editor) | 🧪 exploration |
| P13C2 | B · Before / after (same meeting summarized without and with context) | 🧪 exploration |
| P13C3 | C · Guided prep (who, goal, background, terms + context-strength meter) | 🧪 exploration |
| P13C4 | D · Live effect (editor beside "what Amie does with it") | 🧪 exploration |
| P13C5 | E · Brief templates (empty-state coach with meeting-type templates) | 🧪 exploration |
