---
name: create-release
description: Cut a new Amie macOS app release end to end. Bumps the version in a PR, merges it, tags main to trigger the signed and notarized build, waits for the draft Release, then (after the user confirms) approves the `release` environment so the draft becomes the public Latest release. Use when the user asks to release, ship or publish a new Amie version.
disable-model-invocation: true
argument-hint: "[patch | minor | major | X.Y.Z]"
---

# Create an Amie release

Automates the steps in the "Releasing" section of `apps/amie/README.md`. The pipeline itself is `.github/workflows/amie-release.yml` (preflight, build + sign + notarize, draft Release, then a `publish` job gated by the `release` Environment). Read that README section if anything below is unclear.

Two things are outward-facing and need the user's yes in this conversation: **starting the release** (step 4, the tag push) and **publishing** (step 7). Everything else runs without asking.

Never `gh release edit --draft=false` yourself. The workflow's `publish` job flips the draft and then verifies the public `latest.json`; approving the environment is the supported way and keeps that check.

## Steps

### 1. Pre-checks
- `gh auth status` works, and `origin` is `pavelsvitek/realtime-transcription`.
- Fetch (`git fetch origin --tags`). Find the last release tag: `git tag -l 'app-v*' --sort=-v:refname | head -1`.
- No Release or tag already exists for the new version (the workflow refuses to rerun one).
- List what the release contains: `git log <last-tag>..origin/main --oneline -- apps/amie`. If it is empty, tell the user there is nothing to release and stop.
- Do **not** touch the user's working tree. It may hold unrelated uncommitted work. Do everything below in a temporary worktree: `git worktree add -b amie/bump-<version> ../<repo>-release origin/main` (remove it at the end).

### 2. Pick the version
Use the argument if given (`patch`, `minor`, `major` or an explicit `X.Y.Z`). Otherwise decide from the commits: `feat` means minor, only fixes means patch. State the choice and the reason in one line; don't ask unless it is genuinely unclear (for example a breaking change).

### 3. Bump, PR, merge
In the worktree:
```bash
NEW="$(.claude/skills/create-release/bump-version.sh <arg>)"   # edits tauri.conf.json, Cargo.toml, Cargo.lock
git commit -am "chore(amie): bump version to $NEW"
git push -u origin amie/bump-$NEW
gh pr create --base main --title "chore(amie): bump version to $NEW" --body "<what the release contains, from step 1>"
gh pr merge --squash --delete-branch
```
The tag must point at a `main` that already has the bump. Confirm the PR is `MERGED` and fetch `origin/main`; its head commit must be the bump.

### 4. Tag (starts the release) — confirm first
Tell the user: version, the commit being tagged, and that pushing the tag starts a signed + notarized build that ends at an approval gate (nothing becomes public yet). Wait for a yes unless they already said to go ahead for this release. Then:
```bash
git tag app-v$NEW origin/main
git push origin app-v$NEW
```

### 5. Watch the build
Find the run: `gh run list --workflow amie-release.yml --limit 1` (check it is for `app-v$NEW`). Wait for it without a tight poll loop: `gh run watch <id> --exit-status` in the background, or check every few minutes. The build takes a while (Swift sidecar, Tauri build, two notarizations).

- If a stage fails, read the log (`gh run view <id> --log-failed`), tell the user what failed and stop. Do not retry by re-pushing the tag: the preflight refuses a version that already has a Release. A failure before the draft exists only needs a fixed commit, a new bump and a new tag; ask the user how to proceed.
- The run is ready when the `publish` job is waiting for approval: `gh run view <id> --json jobs --jq '.jobs[] | {name, status}'`.

### 6. Check the draft
```bash
gh release view app-v$NEW --json isDraft,assets,url
```
It must be a draft with exactly four assets: `Amie_$NEW_aarch64.dmg`, `.app.tar.gz`, `.app.tar.gz.sig`, `latest.json`. Check `latest.json` has version `$NEW`. Then tell the user: the draft URL, that the build job cannot exercise the speech model so the DMG deserves a quick install and short meeting, and that the draft notes are the generic text. Offer to edit them (`gh release edit app-v$NEW --notes-file ...`) and, for a feature release, propose a two-line note based on the commits.

### 7. Publish — confirm first
Ask the user to confirm publishing `v$NEW` as the public Latest release (this is what users' auto-updaters will fetch). Only a yes in this conversation counts. Then approve the gate:
```bash
RUN=<run id>
ENV_ID="$(gh api repos/pavelsvitek/realtime-transcription/actions/runs/$RUN/pending_deployments --jq '.[0].environment.id')"
gh api -X POST repos/pavelsvitek/realtime-transcription/actions/runs/$RUN/pending_deployments \
  -F 'environment_ids[]='"$ENV_ID" -f state=approved -f comment="Approved via create-release"
```
If this fails with a permissions error (the token user must be a required reviewer of the `release` environment, and GitHub may block self-approval), do not look for a workaround. Give the user the run URL and ask them to click **Review deployments** themselves.

### 8. Verify and clean up
- Wait for the run to finish; the `publish` job verifies the public `latest.json` itself. Then confirm: `gh release view app-v$NEW --json isDraft,isLatest,url` shows `isDraft: false`, `isLatest: true`, and `curl -fsSL https://github.com/pavelsvitek/realtime-transcription/releases/latest/download/latest.json | jq -r .version` prints `$NEW`.
- Remove the worktree and local branch: `git worktree remove ../<repo>-release && git branch -D amie/bump-$NEW`.
- Report: version, release URL, and that **Amie → Check for Updates…** in an installed copy should offer it.

## Notes
- Apple Silicon only; one release run at a time (the workflow's concurrency group).
- Version lives only in `tauri.conf.json`, `Cargo.toml` and `Cargo.lock`; `bump-version.sh` edits exactly those and verifies they agree. Never edit `Info.plist` or `package.json` versions.
- Dry run of the build without a Release: Actions → amie-release → Run workflow (`gh workflow run amie-release.yml`).
