# Transcription software MCP landscape

Research snapshot for Amie / realtime-transcription: which meeting-transcription products expose MCP servers usable from local Claude Code or Codex, how those interfaces are designed, and what people say on X and Reddit.

## Verdict

Most serious meeting-note products now ship a **remote Streamable HTTP MCP** (OAuth in browser). Claude Code and Codex both support that pattern (`claude mcp add … --transport http …` / `codex mcp add … --url …` then OAuth login). Almost every vendor is **read-heavy**: list → search → get transcript/summary/tasks. **Fireflies** and **Jamie (official)** are the outliers with meaningful write tools. **Granola** dominates social discussion of “meeting notes inside the coding agent”; complaints cluster around plan gates, history caps, wrong-account OAuth, Desktop connector bugs, and missing write/sync to Linear/Notion.

## Client access (Claude Code / Codex)

| Client | Pattern |
| --- | --- |
| Claude Code | `claude mcp add <name> --transport http <url>` → `/mcp` → Authenticate (OAuth). Directory connectors on claude.ai also flow into Code when logged in with the same account. |
| Codex | `codex mcp add <name> --url <url>` → `codex mcp login <name>` for OAuth HTTP servers. Config in `~/.codex/config.toml`. |
| Cursor / VS Code | Paste Streamable HTTP URL; browser OAuth. Older stdio-only clients use `npx mcp-remote <url>`. |

Common requirement: **Streamable HTTP + OAuth / DCR**. SSE-only or Desktop custom-connector quirks still bite some servers (see Granola Desktop bug below).

---

## Product map

| Product | Official remote MCP | Endpoint | Auth | Claude Code / Codex | Write tools? | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Jamie** | Yes | `https://mcp.meetjamie.ai/mcp` | OAuth (DCR); scope often described as `mcp.read` on Copilot | Documented for Claude Code + Cursor | **Yes** on official docs (tasks, tags, templates) | Pro/Team/Enterprise. Microsoft Copilot connector docs still list only 5 read tools — lag vs Jamie’s own docs. Community stdio wrapper also exists (`jamie-mcp` + API key). |
| **Fireflies** | Yes | `https://api.fireflies.ai/mcp` | OAuth or API key via `mcp-remote` | Yes | **Yes** (share, soundbites, rename, move) | Broadest tool surface. In Claude connector directory. |
| **Granola** | Yes | `https://mcp.granola.ai/mcp` | OAuth (DCR); Enterprise EMA | Yes (`claude mcp add granola --transport http …`) | No (read-only) | Most talked-about for Claude Code/Cursor workflows. Free: 30-day history; transcripts/folders paid. Enterprise MCP off until admin enables. |
| **Otter** | Yes | `https://mcp.otter.ai/mcp` | OAuth | Yes | No | Minimal: `get_user_info`, `search`, `fetch`. Claude directory Apr 2026. |
| **Krisp** | Yes | `https://mcp.krisp.ai/mcp` | OAuth PKCE | Yes | No | Core/Advanced plans. 4 tools. |
| **MeetGeek** | Yes (cloud) + local OSS | `https://mcp.meetgeek.ai/mcp` | OAuth (cloud) / API key (local) | Cloud: Cursor etc.; Claude Code listed as “coming soon” on marketing pages — still HTTP URL so Code/Codex should work if client supports remote OAuth | Upload recording only | Dual cloud/local. |
| **Tactiq** | Yes | `https://mcp.tactiq.io` | OAuth + scopes | Yes | No | Free/Pro: list/search; **Team** for details/transcripts. |
| **tl;dv** | Yes (directory) + self-host | `https://mcp.tldv.io/mcp` | OAuth (hosted) / API key (self-host) | Yes | No | Pro+ for directory; Business+ for self-host API. |
| **Fathom** | Yes | `https://api.fathom.ai/mcp` | OAuth; Code often via `mcp-remote` | Yes | Webhooks create/delete on some surfaces | Help center: **7 tools**, per-tool toggles. Community API-key servers also exist. |
| **Vexa** | Yes (OSS / cloud) | `https://api.cloud.vexa.ai/mcp` | API key header | Yes (stdio or URL+header) | Bot join / live transcript oriented | Privacy / self-host pitch vs SaaS. |
| **Fellow / Noota / Bluedot / Zoom AI** | Claimed connectors | Varies | OAuth | Directory-oriented | Typically read-only | Less public tool schema detail found. |

Sources: [Jamie MCP](https://docs.meetjamie.ai/integrations/mcp), [Fireflies MCP tools](https://docs.fireflies.ai/mcp-tools/overview), [Granola MCP](https://docs.granola.ai/help-center/sharing/integrations/mcp), [Otter connector](https://claude.com/connectors/otter-ai), [Krisp summary](https://growthengineer.ai/mcp-servers/krisp), [MeetGeek cloud tools](https://docs.meetgeek.ai/mcp/cloud-mcp/tools), [Tactiq](https://help.tactiq.io/en/articles/14883619-connecting-tactiq-mcp-server), [tl;dv guide](https://tldv.io/blog/how-to-connect-meeting-notes-to-claude-with-mcp/), [Fathom](https://developers.fathom.ai/mcp-docs).

---

## Interface design patterns

Across vendors, the MCP surface converges on the same agent workflow:

1. **Discover** — `list_*` / `search_*` with date, participant, keyword, folder/tag.
2. **Hydrate** — `get_*` by ID for summary, then transcript (often paginated / truncated).
3. **Structured side data** — tasks/action items, tags, folders, calendar, analytics.
4. **Optional writes** — rare; Fireflies (share/clips/organize) and Jamie (tasks/tags/templates) go furthest.

Design choices that matter for Amie:

| Pattern | Who | Implication |
| --- | --- | --- |
| Fat `get_meeting` (summary + transcript + tasks in one) | Jamie | Fewer round-trips; long transcripts need a second paged tool. |
| Split summary vs transcript | Fireflies, MeetGeek, tl;dv, Otter | Cheaper context; agents must chain tools. |
| Conversational “chat with notes” tool | Granola `query_granola_meetings` | Server-side RAG; less control for the client agent. |
| Search grammar / structured filters | Fireflies | Powerful but LLM-hostile unless documented in tool description. |
| Plan-gated tools | Granola, Tactiq, Jamie | Same connector URL, different tool set by SKU — confusing UX. |
| Live / in-progress meetings | Fireflies `get_active_meetings`, live snapshot on transcript | Differentiator for realtime products. |
| Upload / ingest | MeetGeek `submit_recording_for_analysis` | MCP as write path into the STT pipeline. |

---

## Tool inventories (arguments where documented)

### Jamie — official (`https://mcp.meetjamie.ai/mcp`)

From [Jamie docs](https://docs.meetjamie.ai/integrations/mcp) (broader than Microsoft Copilot’s 5-tool preview):

| Tool | Role | Args (from docs / REST parity) |
| --- | --- | --- |
| `list_meetings` | List | Optional: `limit` (def 50, max 100), `cursor`, `startDate`, `endDate`, `tag` |
| `get_meeting` | Full meeting | `meetingId` (required) |
| `get_meeting_transcript` | Paged full transcript | Meeting id + pagination (use when `get_meeting` truncates) |
| `search_meetings` | Semantic search | Query; default last **6 months**; optional start date |
| `search_people` | Contacts | Email → name/role/company |
| `list_tasks` | Action items | Date, status, assignee filters |
| `create_tasks` | Write | Meeting you own; assignee, due, priority |
| `list_templates` / `upsert_template` | Summary templates | Create/update |
| `list_tags` / `create_tag` / `update_tag` / `delete_tag` / `set_tag_sharing` | Tags | Ownership + sharing |
| `add_tag_to_meetings` / `remove_tag_from_meetings` | Tag meetings | Tag + meeting ids |

**Claude Code:** `claude mcp add jamie --transport http https://mcp.meetjamie.ai/mcp`

Community **API-key** stdio server (`vicampuzano/jamie-mcp`): `list_meetings`, `get_meeting`, `delete_meeting`, `search_meetings`, `list_tasks`, `list_tags` — useful if OAuth clients are awkward; not the same surface as hosted MCP.

### Fireflies — (`https://api.fireflies.ai/mcp`)

Largest official surface ([tools overview](https://docs.fireflies.ai/mcp-tools/overview)):

**Meetings:** `fireflies_search` (grammar query + `format`), `fireflies_get_transcripts` (structured filters), `fireflies_get_transcript` (`transcriptId`), `fireflies_fetch` (`id`, experimental), `fireflies_get_summary` (`transcriptId`), `fireflies_get_active_meetings` (`email?`, `states?`), `fireflies_get_analytics` (`startTime?`, `endTime?`).

**Manage:** `fireflies_share_meeting` (`meetingId`, `emails[]`, `expiryDays?`), `fireflies_revoke_meeting_access`, `fireflies_update_meeting_title`, `fireflies_move_meeting` (`meetingIds[]` max 5, `channelId`).

**Channels / soundbites / users / automation:** `fireflies_list_channels`, `fireflies_get_channel`, `fireflies_get_soundbites`, `fireflies_create_soundbite` (`transcriptId`, `startTime`, `endTime`, …), `fireflies_get_user`, `fireflies_get_usergroups`, `fireflies_get_user_contacts`, `fireflies_get_rule_executions` (Enterprise).

`format`: `toon` (default, token-efficient) | `json` | `text`.

### Granola — (`https://mcp.granola.ai/mcp`)

| Tool | Notes |
| --- | --- |
| `query_granola_meetings` | Natural-language chat over notes |
| `list_meetings` | ID, title, date, attendees; folder filter on paid |
| `get_meetings` | Notes + summaries (batch by ids) |
| `get_meeting_transcript` | **Paid**; raw transcript |
| `list_meeting_folders` | **Paid** |
| `get_account_info` | Email + active workspace (debug wrong account) |

Rate limit ~100 req/min. Basic = personal notes last 30 days. Enterprise: MCP scopes admin-gated.

### Otter — (`https://mcp.otter.ai/mcp`)

| Tool | Role |
| --- | --- |
| `get_user_info` | Auth’d user |
| `search` | Meetings by date / participant / topic |
| `fetch` | Full transcript (and related meeting content) |

Minimal “OpenAI Apps-style” search+fetch pattern.

### Krisp — (`https://mcp.krisp.ai/mcp`)

| Tool | Role |
| --- | --- |
| `search_meetings` | Topic, content, attendees, date range → metadata + snippets |
| `get_document` | 32-char document ID (transcript, summary, agenda, …) |
| `list_action_items` | Status / assignee filters |
| `list_calendar` | Upcoming 1–14 days + agenda IDs |

Document-ID indirection (search → get) instead of meeting-centric `get_meeting`.

### MeetGeek cloud — (`https://mcp.meetgeek.ai/mcp`)

| Tool | Args |
| --- | --- |
| `fetch_user_meetings` | `cursor?`, `limit?` (1–100, def 10) |
| `fetch_meeting_metadata` | `meeting_id` |
| `fetch_meeting_transcript` | `meeting_id`, `cursor?`, `limit?` (1–500 segments) |
| `fetch_meeting_highlights` | `meeting_id` |
| `fetch_meeting_summary` | `meeting_id` |
| `fetch_meeting_insights` | `meeting_id` |
| `fetch_team_meetings` | `team_id`, `cursor?`, `limit?` |
| `submit_recording_for_analysis` | `download_url`, `language_code?`, `template_name?` |

Local OSS names differ (`meetgeek:meetings`, etc.) but same ideas.

### Tactiq — (`https://mcp.tactiq.io`)

Capabilities (exact tool names not fully published; scopes are): list, search, summaries, AI artifacts, generation status, transcript moments, full transcript. Scopes: `mcp:meetings:own|shared|spaces|details`. Details/transcripts need **Team**.

### tl;dv hosted — (`https://mcp.tldv.io/mcp`)

| Tool | Role |
| --- | --- |
| `search-meetings` | Keyword, date, participant |
| `get-meeting-transcript` | Speaker-labeled transcript |
| `get-meeting-notes` | AI notes by topic |
| `get-meeting-metadata` | Date, duration, attendees |
| `get-user-profile` | Account |

Self-host: list meetings, metadata, transcript, highlights (no profile). Both **read-only**.

### Fathom — (`https://api.fathom.ai/mcp`)

Official help: **7 tools**, individually toggleable. Public inventory aligns with API: list meetings, get transcript, get summary, list teams, list team members, plus webhook create/delete on some connector listings. Claude Code setup often uses `npx mcp-remote@latest https://api.fathom.ai/mcp` (Node required).

### Vexa

Self-host / cloud meeting-bot API + MCP: send bot to Meet/Zoom/Teams, query transcripts/summaries/action items. Config often API key header on `https://api.cloud.vexa.ai/mcp`.

---

## Social review (X + Reddit)

### How people use it

- **Coding agents with meeting memory:** Cursor / Claude Code + Granola MCP to turn calls into tickets, CRM updates, Linear tasks, PRDs ([example workflows on X](https://x.com/AitechMeeks/status/2098428788963185150), Granola’s own series [@meetgranola](https://x.com/meetgranola/status/2103054465880490243)).
- **Scheduled digests:** Agents that nightly pull recent meetings via MCP into a repo or Notion ([Yohei](https://x.com/yoheinakajima/status/2092615880400322671)).
- **Cross-stack:** tl;dv / Granola MCP + Drive/Slack into a customer DB (JP X thread); Notion Skills wrapping Granola MCP for team-shareable prompts.
- **Privacy / OSS counter-narrative:** Reddit posts push **Vexa** as self-hostable MCP after Fireflies/Otter directory launches ([r/artificial](https://www.reddit.com/r/artificial/comments/1rkli5j/), [r/mcp](https://www.reddit.com/r/mcp/comments/1rkp66y/)).
- **Praise for “dead notes → queryable log”:** Bluedot + Claude MCP on r/ClaudeAI — transcripts become searchable decisions/action items.

Granola dominates X chatter; Jamie/Fireflies/Otter appear more in docs and Reddit “directory launch” threads than in organic “I use this daily in Claude Code” posts.

### Complaints and missing functionality

| Theme | Evidence | Products |
| --- | --- | --- |
| **Read-only MCP** — can’t create Linear/Jira tasks or edit notes from the agent without a second MCP | Product docs; Reddit tips to normalize decisions then sync out | Granola, Otter, Krisp, tl;dv, Tactiq (by design) |
| **History / plan gates** — free = 30 days; transcripts paid; Team seat for details | Granola docs; Tactiq FAQ “mcp:meetings:details required”; Reddit on Granola Business paywall | Granola, Tactiq, Jamie (Pro+ for MCP) |
| **Wrong account / wrong workspace** — OAuth sticks to wrong email; MCP follows active workspace only | Granola troubleshooting (`get_account_info`); Jamie FAQ | Granola, Jamie |
| **Connector flakiness** — “No tools available”; Desktop custom connector silent fail for Streamable HTTP; tools enumerated only at chat start | Jamie + Granola docs; [claude-code#23736](https://github.com/anthropics/claude-code/issues/23736); Fathom troubleshooting | Granola, Jamie, Fathom |
| **Enterprise off by default** | Granola admin MCP scopes; Claude Team owner must enable connectors | Granola, Claude org |
| **Privacy / ZDR broken at MCP boundary** | Fireflies KB: ZDR does not apply once data enters Claude/ChatGPT via MCP | Fireflies (and by extension all SaaS MCPs) |
| **No keyword search on some backends** | Community Fathom MCP notes Fathom API lacks server-side keyword search | Fathom |
| **Capture reliability ≠ MCP** | Reddit: Granola silent miss of ~40% of calls; speaker labels weak | Granola product, not MCP itself |
| **Cost of MCP plan** | X: user stopped using Granola MCP because they don’t want to pay | Granola |
| **Claude Code support lag on marketing** | MeetGeek lists Claude Code as “coming soon” while URL is standard HTTP | MeetGeek |

What users ask for that surfaces as gaps:

1. **Write path:** create tasks in Linear/Jira/Todoist from meeting action items in one agent turn.
2. **Reliable full transcript access** without paid upsell or truncation.
3. **Cross-workspace / shared folder** visibility (Granola MCP historically limited to notes you own; Team space needs Business + scopes).
4. **Live meeting** access (only Fireflies documents active-meeting tools clearly).
5. **Self-host / no third-party LLM retention** (Vexa pitch).
6. **Stable Desktop connectors** for Streamable HTTP + OAuth.

---

## Implications for Amie

Interface spec: [amie-local-mcp.md](./amie-local-mcp.md) (stdio server, Jamie-aligned tools, Phase 1 on today's SQLite).

If Amie ships MCP for Claude Code / Codex:

1. **Match the canonical read set:** `list_meetings`, `search_meetings`, `get_meeting` (summary + metadata), `get_meeting_transcript` (paged), `list_tasks` / action items. That is table stakes vs Jamie/Granola/Otter.
2. **Differentiate where competitors are weak:** live/in-progress transcript snapshot (Fireflies-like), local/privacy story (Vexa-like), and optional writes (`create_task` or deep links) that Granola/Otter lack.
3. **Avoid common UX traps:** document plan gates in tool descriptions; expose `get_account_info`-style identity; paginate long transcripts; support Streamable HTTP + OAuth DCR (and optionally API key for headless Codex).
4. **Expect social comparison to Granola** for “notes in the coding agent,” and to Fireflies for “enterprise conversation data + write tools.”

---

## Sources (primary)

- https://docs.meetjamie.ai/integrations/mcp  
- https://learn.microsoft.com/en-us/connectors/jamieai/  
- https://docs.fireflies.ai/mcp-tools/overview  
- https://docs.granola.ai/help-center/sharing/integrations/mcp  
- https://claude.com/connectors/otter-ai  
- https://docs.meetgeek.ai/mcp/cloud-mcp/tools  
- https://help.tactiq.io/en/articles/14883619-connecting-tactiq-mcp-server  
- https://tldv.io/blog/how-to-connect-meeting-notes-to-claude-with-mcp/  
- https://developers.fathom.ai/mcp-docs  
- https://guide.fireflies.ai/articles/8272956938-learn-about-the-fireflies-mcp-server-model-context-protocol  
- Reddit: r/mcp Vexa, r/artificial Fireflies/Otter MCP, r/ClaudeAI Bluedot MCP  
- X: @meetgranola MCP series; Cursor+Granola workflow posts; GitHub anthropics/claude-code#23736  
