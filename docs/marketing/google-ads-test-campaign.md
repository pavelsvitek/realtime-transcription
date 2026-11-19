# Google Ads test campaign — Amie (Nov 2026)

A 14-day **Demand Gen** test for https://www.getamie.app/: **$5/day, about $70 in total**, aiming for **200–300 clicks**.

## Why Demand Gen and what it costs

Search clicks for meeting-tool terms cost $1–3, so $70 buys only 25–60 of them. Demand Gen shows image (and video) ads in YouTube feeds, Gmail and Discover to people **chosen by what they search for and browse**. Clicks are much cheaper. The estimate below is a guess, not Google data:

| | Estimate |
| --- | --- |
| CPC | $0.20–0.50 (computers only costs more than all devices) |
| Clicks for $70 | 140–350; **200–300 is a realistic target** |
| CTR | 0.5–1.5% |
| Click → download | 2–6%, so expect roughly **5–15 downloads** |

The trade-off: these people weren't looking for a note taker when they saw the ad. Expect more bounces than from Search. You'll learn **which audience and which message** get attention, and whether that turns into downloads.

## Conversion tracking

- Done in code: `download_click` and `download_unsupported` go to GA4 (`apps/web/src/lib/track.ts`).
- To do in GA4: mark `download_click` as a **key event**.
- To do in Google Ads: link GA4, import `download_click` (Goals → Conversions → Import → GA4) and set it as **primary**.
- Watch `download_unsupported` too. It shows how much paid traffic comes from Windows or old Macs.

## Campaign settings

| Setting | Value |
| --- | --- |
| Campaign type | Demand Gen. Goal: Website traffic. |
| Budget | $5/day, start date + end date (14 days). |
| Bidding | **Maximize clicks**. If a max CPC limit is offered, set it to **$0.40**. Don't use Maximize conversions or tCPA: $5/day won't get Google enough conversions to learn from. |
| Locations | Netherlands, Sweden, Denmark, Norway, Canada, Australia. Option: "Presence: people in or regularly in". |
| Languages | English, Dutch, Swedish, Danish, Norwegian. The ads are in English. |
| Channels | Turn on YouTube (in-feed, Home feed, watch next, Search) and Gmail. **Turn off the Display Network and YouTube Shorts**: they're cheap but full of accidental clicks. Discover is on phones only, so it won't serve once devices are computers only. |
| Devices | **Computers only.** If the operating-system option shows macOS, target only macOS. Otherwise, every ad says "Mac" so Windows users skip it. |
| Demographics | Age **25–34 and 35–44** (targeting, not observation). Untick "Unknown". |
| Optimized targeting | **Off.** Otherwise Google widens the audience beyond the segments below. |
| Content exclusions (account level) | Exclude content made for kids, games and embedded videos. |

## Ad groups (audiences)

Two ad groups, one per audience, with the same ads in both. The budget is shared at campaign level. If one group gets most of the spend after 5 days, that's Google's own signal for which audience responds.

### Ad group 1 — Note-taker intent
Custom segment → **People who searched for any of these terms on Google**:

```
granola ai, granola app, granola alternative
otter ai, otter.ai alternative, fireflies ai, fathom notetaker, tldv, read ai, krisp notes
ai note taker, ai meeting notes, meeting notes without bot
transcribe zoom meeting, transcribe google meet, transcribe teams meeting
meeting transcription mac, meeting recorder mac
```
In the same segment, add **people who browse websites similar to**: `granola.ai, otter.ai, fireflies.ai, fathom.video, tldv.io, read.ai`

### Ad group 2 — Target roles and their tools
Custom segment → **People who searched for any of these terms**:

```
user interview questions, customer discovery interview, user research synthesis
product manager tools, product discovery, jobs to be done interview
figma, linear app, notion ai, cursor ai, claude code, mcp server
```
In the same segment, add **websites similar to**: `figma.com, linear.app, cursor.com, productboard.com, dovetail.com, maze.co`

### Exclusions (both groups)
Once downloads arrive, add a **website visitors who triggered `download_click`** audience as an exclusion, so the budget doesn't go on people who already downloaded.

## Ads

One **single-image ad** per ad group. Add a video ad as well if a cut of the launch video exists (`docs/brand/launch-video-script.md`). Demand Gen limits: headline 40 characters, description 90. All lines below fit.

**Business name:** Amie · **CTA:** Download · **Final URL:**
`https://www.getamie.app/?utm_source=google&utm_medium=demandgen&utm_campaign=test_nov26&utm_content={adgroupid}`

**Headlines**
- Mac meeting notes, no bot on the call
- Your meetings, transcribed on your Mac
- Zoom, Meet and Teams, transcribed live
- No meeting bot. Local by default. Mac.
- Ask Claude what was said in your meeting

**Descriptions**
- Amie transcribes Zoom, Google Meet and Teams calls on your Mac, word by word. No bot.
- Live transcripts and summaries with speakers attributed. Local by default.
- Search your meetings from Claude or Cursor through a local MCP server on your Mac.
- For Macs with Apple silicon on macOS 15+. Works with the calls you already have.
- Tired of bots joining your calls? Amie listens on your Mac instead and names speakers.

**Images** (the creative matters more than the copy in feed ads):

| Asset | Size | What to show |
| --- | --- | --- |
| Landscape 1.91:1 | 1200×628 | Live transcript next to a Zoom/Meet window, with speaker names visible |
| Square 1:1 | 1200×1200 | The "On air" hero: Amie window on the dark canvas |
| Portrait 4:5 | 960×1200 | Transcript card + "No bot on your call" |
| Logo 1:1 | 1200×1200, ≤150 KB | Amie icon |

Keep text on images minimal; let the product screenshot carry it. Use real UI from the Paper Components page, not mock-ups.

## Checks during the test

- **Day 3:** Is it spending about $5/day? If spend is under $2/day, the audience is too narrow: add the UK and Ireland, or turn on "Unknown" age.
- **Day 3 and 7:** In GA4, check landing-page engagement and the share of `download_unsupported`. If more than 30% of visitors are on Windows, tighten the copy ("for Mac" first) or make ad group 1's search terms more Mac-specific.
- **Day 7:** If one ad group has CPC above $0.60 and no downloads, pause it.

## How to read the results (day 14)

| Metric | Good | If not |
| --- | --- | --- |
| Clicks | 200–300 | Under 150: CPC is too high. Drop the most expensive country. |
| CPC | < $0.35 | — |
| CTR | > 0.8% | Under 0.4%: the creative isn't working. Swap the image first, then the headline. |
| Click → download | > 3% | Under 1%: traffic is low intent or not on Mac. Shift budget toward ad group 1. |
| Engaged sessions (GA4) | > 40% | Low: people bounce. Check the page on a 13" laptop. |

**Next step:** take the winning audience and message into Search (the long-tail keyword plan from v1), once there's budget for $1–3 clicks.
