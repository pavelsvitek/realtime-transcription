# Amie desktop: migrate App.css to Tailwind

Status: plan, not started. Scope: `apps/amie` (the Tauri desktop app) only.

## Where we are

- All styling lives in one file, `apps/amie/src/App.css` (about 2,070 lines, ~280 top-level rules). Components use plain class names such as `meeting-*`, `settings-*`, `onboarding-*`, `home-*` and `btn`.
- Colours are CSS variables on `:root` (`--surface-*`, `--text-*`, `--border-*`, `--brand-*`, `--status-danger-*`).
- Dark mode is driven by `data-theme` on `<html>` (`system` | `light` | `dark`, set in `src/lib/color-scheme.ts`). The dark values are written **twice**: once under `[data-theme="dark"]` and again under `@media (prefers-color-scheme: dark) { :root[data-theme="system"] }`, plus a few per-component dark overrides.
- The heaviest users of classes are `SettingsPage` (~120 `className`s), `MeetingsPage` (~43), `OnboardingDialog` (~34) and `TranscribePage` (~23).
- A few things are not plain utilities: `@keyframes` (`listening-eq`, `spin`, `blink`), `prefers-reduced-motion`, `:has()` on the error banner, and the macOS title-bar strip (`--window-chrome-top`).
- Vitest runs in the `node` environment on `src/**/*.test.ts`, so no test asserts on class names or rendered styles. A visual check is the only safety net.
- `apps/web` already uses Tailwind v4 through `@tailwindcss/vite`, with the same palette spelled out as `@theme` colours.

## Goal

Every component styled with Tailwind utility classes, one small CSS entry file for tokens and the few things utilities can't express, and **no visual change**. Dark mode keeps working for all three `data-theme` values.

## Decisions

1. **Tailwind v4 with `@tailwindcss/vite`**, the same setup and version range as `apps/web`, so both apps share one way of working.
2. **Keep the CSS variables as the source of truth and point the Tailwind theme at them** with `@theme inline`:
   ```css
   @theme inline {
     --color-surface-shell: var(--surface-shell);
     --color-text-primary: var(--text-primary);
     --color-brand-primary: var(--brand-primary);
     /* …one line per existing token */
   }
   ```
   Components then write `bg-surface-shell text-text-primary`, and dark mode is just the existing variable swap. There are no `dark:` variants to sprinkle around. That keeps the three-way `data-theme` behaviour exactly as it is and avoids copying `apps/web`'s separate `dark-*` colour set.
3. **Deduplicate the dark tokens once**: define them a single time and apply them to both `[data-theme="dark"]` and `system` + `prefers-color-scheme: dark`, for example with a `@custom-variant` or one shared selector list. Fold the per-component dark overrides into tokens where possible.
4. **Add a `cn()` helper** (`clsx` + `tailwind-merge`) in `src/lib/cn.ts` for conditional classes. Today `Sidebar` and `AudioDeviceMenu` build class strings by hand.
5. **Extract small components, not `@apply` classes.** Repeated patterns become React components or class constants: `Button` (primary, secondary, danger, accent), `Dialog` shell, `SettingsSection`, `Tabs`. `@apply` is allowed only for the handful of global rules left in CSS.
6. **What stays in CSS** (`src/styles.css`, replacing `App.css`): the `@import "tailwindcss"`, tokens, `@theme inline`, base rules (font, body, `#root`, `color-scheme`), the three keyframes (registered as `--animate-*` theme values), the reduced-motion rule, and the `:has()` error-banner rule unless it is easy to express as `has-[…]:`.
7. **Disable Preflight's surprises**: check form controls, `button` cursor, heading sizes and list styles after adding Tailwind. `App.css` already resets `margin` and `padding` and sets `box-sizing`, so Preflight should change little, but selects and native controls in Settings need a look.

## Steps

Each step is one PR that ships on its own and leaves the app looking the same.

1. **Set up Tailwind beside App.css.** Add `tailwindcss` and `@tailwindcss/vite` to `apps/amie`, register the plugin in `vite.config.ts`, create `src/styles.css` with the import, `@theme inline` mapping and the deduplicated tokens, and import it before `App.css` in `main.tsx`. Add `cn()`. Run the app in both themes and fix anything Preflight changed. No component changes yet.
2. **Shared primitives.** Build `Button`, the dialog shell (used by Start/Stop/Archive/Delete/FollowUp confirms, ShortMeetingNotice, UpdateDialog and OnboardingDialog), `Spinner` and the tab bar (`MeetingTabs`). Move their rules out of `App.css`.
3. **Shell.** `AppLayout`, `Sidebar`, `TitleBar`, `LiveMeetingButton`, `StartMeetingButton`, `MicIndicator` and the listening animation.
4. **Home and Transcription.** `HomePage`, `TranscribePage`, `TranscriptFeed`, `AudioDeviceMenu`, `SpeakerNamesPrompt`, error banners and the footer.
5. **Meetings.** `MeetingsPage`, `MeetingTitle`, `MeetingContextEditor`, `MeetingOverflowMenu`, summary markdown styles. The summary renders markdown, so decide here between a scoped set of element rules in CSS and `@tailwindcss/typography`. Prefer a few scoped rules; typography is a large dependency for a small surface.
6. **Settings and onboarding.** `SettingsPage` (the biggest file; split it into section components while converting), `OnboardingDialog` and `UpdateDialog` contents.
7. **Remove App.css.** Delete what is left, move any survivors into `styles.css`, and remove the now-unused Vite/Tauri/React demo assets and the `greet` command.

## How to check each step

- `pnpm --filter amie build` (runs `tsc` and `vite build`) and `pnpm --filter amie test`.
- Run Amie Dev (`pnpm tauri dev`) and compare each touched screen against the frames on the Paper page "Amie Desktop · Current UI" in light, dark and system-dark. The page has a frame for nearly every screen and state, including dialogs, menus and update states, so it works as the visual baseline.
- Before a step lands, grep `App.css` for the class names the step converted. A rule left behind with no user is dead code; a class still used in TSX but deleted from CSS is a regression.

## Risks

- **Silent visual drift.** Nothing automated catches it. Mitigation: small PRs, screen-by-screen comparison with Paper, and screenshots of before and after in each PR.
- **Two systems at once.** While `App.css` and Tailwind coexist, the cascade can fight: Tailwind utilities sit in `@layer utilities`, and any unlayered rule in `App.css` beats them whatever its specificity. Remove a component's old rules in the same PR that converts it, and don't leave a component half-converted.
- **Long class strings in `SettingsPage`.** Splitting it into section components in step 6 keeps that readable.
- **Theme regressions.** The `data-theme="system"` path is the easiest to break. Check it explicitly with the macOS appearance switched.

## Out of scope

- Visual redesign. The setup wizard and other new Home states should be built after step 2, on the new primitives, but are separate work.
- Sharing a Tailwind preset or token package between `apps/web` and `apps/amie`. Worth doing later; the colours already match.
