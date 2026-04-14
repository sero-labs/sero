# Refactoring Plan — plugins/sero-kanban-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-kanban-plugin/` is still a strong plugin-platform exemplar: the manifest, MF build, shared-contract move to `@sero/common`, widget exposure, and AD-020 tool registration are all pointed in the right direction. The real debt is runtime truthfulness. The package currently has two workflow engines — the extension tool path and the UI’s local reducer path — and they already disagree on review actions. On top of that, the board/error-log readers fail open on malformed JSON, and the settings surface has drifted between UI and tool help. The right outcome is one canonical action path for side-effectful workflow changes, fail-loud file reads, aligned settings semantics, and smaller tested UI modules.

## Issues Found (prioritized)
- **High** — UI workflow actions bypass the extension’s real side effects — `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx:60-98,313-366` drives planning/approve/retry/review actions through local `onUpdate(...)` reducers, and `plugins/sero-kanban-plugin/ui/lib/card-workflow.ts:58-182` mutates review cards directly. But the real host-integrated behavior lives in `plugins/sero-kanban-plugin/extension/review-actions.ts:40-131` and `plugins/sero-kanban-plugin/extension/workflow-actions.ts:23-133`, where requesting revisions deletes review cache + appends an error entry and canceling a PR closes GitHub, removes the worktree, deletes the cache, and logs the action. From the UI path, those side effects never run. For Sero specifically, that means the exemplar plugin teaches the wrong ownership boundary for host effects. Effort: **M**.

- **High** — Board/error-log reads fail open on any read or parse problem — `plugins/sero-kanban-plugin/extension/state-io.ts:28-34` returns `createDefaultKanbanState()` on every exception, and `plugins/sero-kanban-plugin/extension/error-log.ts:22-29` returns an empty normalized log on every exception. A malformed or partially-written JSON file is therefore treated the same as “file missing on first run,” and the next write can silently erase the board or retrospective history. Effort: **S**.

- **Medium** — The settings contract is split between UI, tool schema, and runtime behavior — `plugins/sero-kanban-plugin/extension/index.ts:32-42` documents only `yoloMode`, `testingEnabled`, and `reviewMode`; `plugins/sero-kanban-plugin/extension/workflow-actions.ts:149-184` only reads/writes those three keys while merely displaying `autoAdvance`; and `plugins/sero-kanban-plugin/ui/components/SettingsPanel.tsx:191-240` exposes `yoloAutoMergePrs` plus prototype/full review controls. The runtime-backed settings no longer have one truthful control surface for agents and humans. Effort: **S**.

- **Medium** — Cleanup helpers suppress the exact failures that matter for review-state repair — `plugins/sero-kanban-plugin/extension/review-artifacts.ts:57-65` swallows cache-delete failures, and `plugins/sero-kanban-plugin/extension/worktree-cleanup.ts:7-19` swallows `git worktree prune` failures. In a plugin whose review UX already depends on worktree/cache hygiene, silent cleanup failures become future “why is this card stuck?” mysteries. Effort: **S**.

- **Medium** — The heaviest UI modules are near cap and the local workflow layer has no direct tests — `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx:1-466`, `plugins/sero-kanban-plugin/ui/components/DescriptionEditor.tsx:1-405`, and `plugins/sero-kanban-plugin/ui/components/ActivityPanel.tsx:1-393` already concentrate too much behavior in a few files, while `plugins/sero-kanban-plugin/vitest.config.ts:4-5` only includes `extension/**` and `shared/**`. That is especially risky because the untested UI layer is also the one duplicating workflow transitions. Effort: **M**.

- **Low** — Dead/duplicated UI scaffolding remains in the package — `plugins/sero-kanban-plugin/ui/components/AddCardForm.tsx:1-113` has no importers while `plugins/sero-kanban-plugin/ui/components/ColumnView.tsx:156-210` reimplements the same add-card flow inline, and `plugins/sero-kanban-plugin/ui/components/CardDetailFooter.tsx:17-29` still accepts an unused `onPriorityChange` callback. Effort: **S**.

## Proposed Refactoring
1. **⊘ obsolete — 2026-04-13 (`ff4e460a`) the desktop host already applies the review-side effects for UI state transitions via `applyReviewActionEffects`, so the claimed High bypass no longer exists.**
   - Keep pure card-shape helpers shared, but stop letting the UI directly “fake” review side effects.
   - Target structure:
     - `plugins/sero-kanban-plugin/shared/actions.ts` (or equivalent) for shared action names / request payloads / result types
     - `plugins/sero-kanban-plugin/extension/` remains the sole owner of GitHub/worktree/cache/error-log side effects
     - `plugins/sero-kanban-plugin/ui/hooks/useKanbanActions.ts` (or equivalent) invokes the canonical host action path instead of mutating review workflow state inline
   - UI-local `apply*` reducers should be limited to genuinely local/pure edits, or deleted entirely if the host action path can cover them cleanly.
   - This aligns the plugin with AD-020’s “tool/command semantics live in the bridged extension layer” model instead of teaching future plugin authors to duplicate host behavior in React.

2. **~~Fail loud on malformed board/error-log files and only default on missing files.~~ ✅ 2026-04-13 (`336b790a`)**
   - Change `state-io.ts` and `error-log.ts` so `ENOENT`/first-run reads still create a usable empty/default state, but syntax/permission/short-read failures surface an actionable error instead of silently resetting.
   - If the tool path encounters malformed JSON, abort the mutation and return a recovery-oriented message (include file path and backup/repair guidance).
   - Keep atomic writes, but make read failure modes truthful.

3. **~~Define one shared settings descriptor and use it in both the tool layer and the UI.~~ ✅ 2026-04-14 (`1d433349`)**
   - Add a small canonical settings metadata module under `shared/` or `@sero/common` ownership for the keys this plugin intentionally exposes.
   - Use it to drive:
     - tool schema/help text in `extension/index.ts`
     - `handleSettings()` read/write behavior
     - `SettingsPanel` labels, grouping, and read-only vs mutable settings
   - Decide explicitly whether `autoAdvance` is user-editable, read-only, or intentionally hidden. If `yoloAutoMergePrs` is runtime-backed, the tool surface should acknowledge it too.

4. **~~Replace silent cleanup catches with scoped warning helpers.~~ ✅ 2026-04-14 (`86342e2a`)**
   - Create one helper that tolerates expected not-found cases but logs or returns contextual warnings for real cache/worktree cleanup failures.
   - Feed those warnings into the same review/error-log story instead of burying them in ignored promises.
   - Preserve best-effort cleanup semantics where necessary; just stop making failures invisible.

5. **~~Split the heavy UI modules before they cross the 500-LOC cap and add direct UI coverage.~~ ✅ 2026-04-14 (`1d433349`)**
   - `ui/components/CardDetail.tsx`
     - extract card metadata/version-control rendering
     - extract workflow-action section (planning/review/retry panels)
     - extract error/review-status display block
   - `ui/components/DescriptionEditor.tsx`
     - extract AI-enhance behavior into a hook/service and keep the component focused on rendering/editing
   - `ui/components/ActivityPanel.tsx`
     - split elapsed timer / tool feed / narrative feed / live output sections into focused subcomponents
   - Add direct tests for the remaining local workflow helpers and UI review controls before changing them again.

6. **~~Delete the leftover duplicated UI scaffolding.~~ ✅ 2026-04-14 (`1d433349`)**
   - Either wire `AddCardForm` into `ColumnView` or remove it.
   - Remove the unused `onPriorityChange` API from `CardDetailFooter`, or add a real priority control if that behavior is intentionally deferred.
   - Keep the plugin’s exemplar status clean: dead UI code invites copy-paste debt into later plugins.

## Benefits & Trade-offs
- Benefits: restores one truthful workflow path for host-integrated actions, prevents silent board/history loss on malformed files, makes the human and agent settings surfaces agree again, and lowers review load on the heaviest UI files.
- Trade-offs: the canonical-action fix likely requires new bridge/plumbing work between the remote UI and the extension/host layer, and surfacing malformed-file errors will be noisier than today’s fail-open behavior.

## Dependencies & Risks
- The canonical-action cleanup depends on choosing a real host-backed invocation path for remote UI actions. Do **not** replace the current reducers with chat-prompt hacks; keep side-effectful workflow ownership aligned with AD-020 and existing plugin/runtime patterns.
- Hardening malformed-file reads is a behavioral change. Users may now see explicit board/log read errors where today the plugin silently continues; recovery UX needs to be part of the change.
- The recent shared-contract move added runtime value re-exports from `plugins/sero-kanban-plugin/shared/types.ts:23-30` and `plugins/sero-kanban-plugin/shared/validation.ts:10-16`, while `plugins/sero-kanban-plugin/package.json:74-89` still treats `@sero/common` / `@sero-ai/app-runtime` as dev-time workspace deps. Before landing cleanup that leans further on those imports, verify built-in plugin staging/package builds still resolve them correctly outside the monorepo layout.
- Adding UI tests may require a jsdom/browser test surface instead of the current node-only Vitest config.

## Next Steps
1. Map every UI-triggered action to either **pure local edit** or **host-side-effectful workflow action**.
2. Convert the review actions (`request-revisions`, `cancel-pr`) first so the most obviously incorrect behavior stops teaching the wrong boundary.
3. Harden `state-io.ts` and `error-log.ts` so malformed JSON cannot silently reset the board/log.
4. Align the settings descriptor across `extension/index.ts`, `workflow-actions.ts`, and `SettingsPanel.tsx`.
5. Split `CardDetail.tsx` first, then add UI coverage for whatever local workflow helpers remain.

Verification checklist:
- From the UI, `request-revisions` deletes the cached review artifacts and appends the same warning entry the tool path does.
- From the UI, `cancel-pr` actually closes the GitHub PR, removes the worktree, clears the review cache, and only then resets the card to backlog.
- A malformed `.sero/apps/kanban/state.json` or `errors.json` no longer gets silently replaced with an empty/default file on the next write.
- `kanban settings` and the Settings panel describe the same runtime-backed settings and constraints.
- Production/built-in plugin packaging still loads the extension, `KanbanApp`, and `KanbanWidget` after the `@sero/common` runtime import move.

## Execution log
- `336b790a` — `fix(plugins): harden persisted state integrity`
- `ff4e460a` — `fix(plugins): make web and context actions truthful` *(validated this plan's remaining High item as obsolete under current host state-transition wiring)*
- `86342e2a` — `refactor(plugins): land E4 runtime semantics batch` *(kanban: review/worktree cleanup now returns scoped warnings that are surfaced in tool output and the board error log)*
- `1d433349` — `refactor(kanban): align settings and split ui panels`
