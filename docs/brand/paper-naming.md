# Paper naming codes

File: **Amie Website** (Paper). Every design is addressable by a short code.

- `P<n>` = page number. `P<n>C<m>` = container (artboard) `m` on page `n`. Example: `P3C4` is "B · Calm hero — Stage 1" on page 3.
- Codes are **stable**: never renumber. A new page takes the next free `P`, a new artboard the next free `C` on its page. A deleted code is retired, not reused.
- Page names read `P<n> <Area> - <label>`. Areas: `App` (screens of the Amie desktop app), `Web` (website), `Brand`, `Ads`.
- Artboard names read `P<n>C<m> <label>`. Section headers and "Label ·" banners carry no code.
- On `P3` a status marker follows the code: ✅ = implemented in the app, 🧪 = exploration (not built). The label banners above each row repeat the status.
- Only the three `App` pages (P1–P3) have artboard codes so far. Add codes to the other pages when you first need to reference them.

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

## P3 status

| Code | Design | Status |
|---|---|---|
| P3C1–C2 | A · Setup dashboard, Stage 0 / 1 | 🧪 exploration |
| P3C3 | B · Calm hero, Stage 0 | 🧪 exploration |
| P3C4 | B · Calm hero, Stage 1 | ✅ implemented (#65) |
| P3C5–C6 | C · First-meeting walkthrough, Stage 0 / 1 | 🧪 exploration |
| P3C7–C13 | B · Setup wizard, steps 0–6 | ✅ implemented (#67) |
