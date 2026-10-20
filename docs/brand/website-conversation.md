# Website conversation — Roadmap cut

Canon for every marketing surface: the above-the-fold Amie window, the word-by-word crop, Local MCP, speaker ID, meeting summary, and later follow-up frames.

Do not invent extra people, meetings, or lines on the site. If a scene needs more transcript, add it here first.

The live meeting is a **product-team sprint planning** call. Amie is capturing it on this Mac (**me**). The landing MCP client is **Claude Cowork** (dark window). Cursor, Claude, or ChatGPT can ask the same questions; the site shows Cowork. Meetings never leave this machine.

## People

Four people. First names on the site; full names only in this file. The local camera is labeled **me**, not You.

| Id | Name | Role | Color | Notes |
| --- | --- | --- | --- | --- |
| `me` | me | Local | `--color-dark-text-primary` (`#E5E5E5`) | Local camera on **this Mac**. Zoom / Teams tile **me**. In the real app this speaker is tagged **You**. No lines in the live transcript — listening. |
| `sam` | Sam Rivera | Product | `--color-dark-speaker-user` (`#EE99A4`) | On the call from product. MCP cites **Sam**. |
| `maya` | Maya Chen | Engineering | `--color-dark-speaker-remote` (`#F0A090`) | On Zoom from the engineering side. Asks what’s in for the sprint, then checks local latency. Active speaker in the Zoom / Teams frames. |
| `jordan` | Jordan Hale | Design | `#8EC8F0` | On Zoom from design. Owns transcript chrome / export readability. |

Do not reintroduce **Alex**, **You**, or unnamed “User” labels on the website. The local tile is **me**.

## Meetings

Newest last. “The 2nd meeting” in MCP means this list order.

| # | Title | When | Status |
| --- | --- | --- | --- |
| 1 | Q3 planning | Mon 10:00 | Earlier cut. Same four people. |
| 2 | Sprint planning | Today | **Live.** This is the above-the-fold window. |

### 1 · Q3 planning (Mon 10:00)

Scope meeting from earlier in the week. Enough to exist as a list row — not shown as a transcript on the current landing.

They ranked Q3 bets and left local capture vs cloud fallback **undecided**. Sprint planning is the follow-up that closes it.

### 2 · Sprint planning (Today) — live

Zoom. This Mac (**me**) is running Amie (local Nemotron, mic + system audio). Sam, Maya, and Jordan are remote. The window title is **Sprint planning**.

**Decisions in this meeting** (what MCP returns for “the 2nd meeting”):

1. **Local capture first — cloud fallback waits.** Sam, `0:15`
2. **Freeze the transcript chrome so summaries stay readable.** Jordan, `0:22`
3. **Stay local if latency holds.** Maya, `0:31`

The live line at `0:38` is Sam answering Maya’s latency question. It is still being written. It is **not** a fourth decision yet.

## Transcript (live)

Use this wording exactly. The live line is mid-word on purpose (`hundr|`).

| Time | Speaker | Line |
| --- | --- | --- |
| 0:08 | Maya | So for this sprint, what’s actually in? |
| 0:15 | Sam | Local capture first. Cloud fallback can wait. |
| 0:22 | Jordan | Then freeze the transcript chrome so summaries stay readable. |
| 0:31 | Maya | Local is fine if latency holds. What’s median looking like? |
| 0:38 | Sam | Sure, median was around two hundr\| *(live)* |

Word-by-word crop: `0:15`–`0:38` of this table (decision cluster + live line).

## MCP story

Two turns. Same Amie database. Scroll-driven; do not add a third question on the landing. Client chrome is **Claude Cowork Window — Dark** (`#1C1B19`, Cowork selected, “Give Claude a task”).

### Turn 1

**Query:** Find last 2 roadmap meetings

**Reply:** Last 2 roadmap meetings on this Mac:

1. Q3 planning · Mon 10:00
2. Sprint planning · Today

Source chip: `this Mac`

From turn 2 onward, row **2. Sprint planning** is highlighted.

### Turn 2

**Query:** Show all decisions from the 2nd meeting

**Reply:** Decisions from Sprint planning · Today

- Local capture first — cloud fallback waits. · Sam · 0:15
- Freeze the transcript chrome so summaries stay readable. · Jordan · 0:22
- Stay local if latency holds. · Maya · 0:31

Source chip: `0:15–0:31 · this Mac`

## Meeting summary

Post-call. Written after **Stop**, on the Meetings detail **Summary** tab — not over Zoom, not in the live transcript window.

Match the real app (`meeting-summary.txt`, `SummaryMarkdown`, `MeetingsPage`):

- Page chrome: date, **28px** meeting title, tabs **Summary / Context / Transcript**, then **Generate** / **Copy summary**
- Markdown column, max **720px**: `## Executive Summary` (exactly five `- ` bullets) then `## Full Summary` with `###` noun-phrase headings and nested bullets two–three levels deep
- Third-person past tense. **Bold** speaker names on every mention. **Bold** thesis labels (`Decision:`, `Next step:`, `Risk:`). _Italic_ product / code names
- Names are **not** chips, owner rails, or Zoom overlays. They are bold spans in the prose, same as the app. Marketing may color those name spans with the speaker table above; everything else stays ink

Do not mention **me**. They did not speak. Do not invent a median number — Sam had not finished that sentence.

**Title:** Sprint planning — local capture first

### Executive Summary

```md
## Executive Summary

- **Local capture first:** **Sam** put local capture in this sprint. Cloud fallback waits.
- **Transcript chrome freeze:** **Jordan** will freeze the transcript chrome so summaries stay readable.
- **Latency gate:** **Maya** is fine staying local if latency holds, and asked what median looks like.
- **Open:** **Sam** had started to answer median latency when the recording stopped.
- **Next step:** Confirm median latency so **Maya** can hold the local-only cut.
```

### Full Summary

```md
## Full Summary

### Scope this sprint

- **Sam** on capture:
    - Local capture is in for this sprint.
    - Cloud fallback waits for a later cut.

### Transcript chrome

- **Jordan** owns freezing the transcript chrome:
    - Goal: summaries stay readable in export.

### Latency

- **Maya** holds the local-only decision if latency is acceptable.
    - She asked for median.
    - **Sam** had begun to answer when the recording stopped.
```

### Landing crop

Amie **Meetings** detail, Summary tab — inside the full app window (sidebar, Start a meeting, Meetings active). Paper component: **Meetings Summary Window — Dark**, same 1040×680 chrome as the live transcription window.

Variants A–B show the title + Executive Summary. **C · Full Summary** is the landing treatment: that window, colored names, nested Full Summary. Highlight **Sam / Maya / Jordan** only — thesis labels stay ink.

## Surfaces

| Surface | Uses |
| --- | --- |
| Hero Amie window | Full live transcript, title **Sprint planning**, speakers **Sam / Maya / Jordan** |
| Word-by-word crop | `0:15`–`0:38`, same wording |
| Local MCP chat | **Claude Cowork Window — Dark**. The two queries and replies above |
| Speaker ID (Zoom / Teams) | **A · Color lock** on the landing, before meeting summary. Four tiles: **me**, Sam, Maya, Jordan. Maya speaking. Same name color on Zoom chips and the transcript crop. |
| Meeting summary | Full Amie window, Meetings detail, Summary tab. Real Amie markdown; names **Sam / Maya / Jordan** bold (optionally speaker-colored). |
| Code | [`apps/web-prototype/src/data/roadmap-cut.ts`](../../apps/web-prototype/src/data/roadmap-cut.ts) — keep in sync with this file |

When speaker ID or follow-up meetings land on the site, reuse this cast. The follow-up is the **cut review** with me, Sam, Maya, and Jordan — not a new team.
