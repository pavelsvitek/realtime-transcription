# Entity API naming

Same verbs in React and Rust. React is camelCase, Rust/Tauri is snake_case, same words. `invoke` uses the Rust command name.

This is the convention for SQLite-backed entities. Meeting is the first; later entities should follow the same four verbs.

## Four verbs

| Rule | React | Rust `invoke` | Returns |
| --- | --- | --- | --- |
| 1. get all | `getAllMeetings()` | `get_all_meetings` | list projection (`MeetingListItem[]`) |
| 2. get by id | `getMeeting(id)` | `get_meeting` | full entity or `null` |
| 3. patch by id | `patchMeeting(id, payload)` | `patch_meeting` | updated full entity |
| 4. delete by id | `deleteMeeting(id)` | `delete_meeting` | `void` |

There is no `create` command for Meeting: a live row is created as a side effect of starting transcription.

## `patch`

`payload` is optional fields of the entity — only keys being changed. One or many attributes per call. Omitted keys are left unchanged. Returns the updated entity.

Empty string on a nullable field (e.g. `context: ""`) clears it. `null` in TypeScript is sent as `""` so it also clears.

```ts
patchMeeting(id, { title: "Weekly sync" })
patchMeeting(id, { context: "Pavel, Igor" })
patchMeeting(id, { title: "Weekly sync", context: "Pavel, Igor" })
patchMeeting(id, { archivedAt: Date.now() })
```

Archive is `patch({ archivedAt })`, not a dedicated command.

## React Query wrappers

Same names, `use*` prefix:

| Query / mutation hook | Calls |
| --- | --- |
| `useGetAllMeetingsQuery()` | `getAllMeetings` |
| `useGetMeetingQuery(id)` | `getMeeting` |
| `usePatchMeetingMutation()` | `patchMeeting` |
| `useDeleteMeetingMutation()` | `deleteMeeting` |

Hooks live in `apps/amie/src/models/<Entity>/queries.ts` and `mutations.ts`. Query keys live next to the queries.

## Meeting specifics

| Function | Returns | Notes |
| --- | --- | --- |
| `getAllMeetings` | `{ id, startedAt, title, teaser }[]` | Finished, not archived, newest first |
| `getMeeting` | `{ meeting, segments } \| null` | `null` when missing — do not throw |
| `patchMeeting` | `{ meeting, segments }` | May set `title`, `context`, `archivedAt` |
| `deleteMeeting` | `void` | Hard-deletes the row and transcript |

Leave `summary` / `teaser` / `status` / `finishedAt` to transcription and summary jobs.

### Not these four verbs

Keep as separate commands (not Meeting CRUD):

| React | Rust | Why |
| --- | --- | --- |
| `getLiveMeeting()` | `get_live_meeting` | Lookup by live status, not id |
| `generateMeetingSummary(id)` | `generate_meeting_summary` | Kicks an LLM job; SQLite write is async |
| `startTranscription` / `stopTranscription` | `start_transcription` / `stop_transcription` | Transcription commands; they create/finish the row as a side effect |
| `getSummaryJob(id)` | `get_summary_job` | In-memory job, not SQLite |
