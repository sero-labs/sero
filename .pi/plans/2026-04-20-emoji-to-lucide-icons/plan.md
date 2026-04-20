# Emoji to Lucide Icons Implementation Plan

**Date:** 2026-04-20  
**Status:** Draft  
**Spec:** `.pi/plans/2026-04-20-emoji-to-lucide-icons/spec.md`  
**Scout:** `.pi/plans/2026-04-20-emoji-to-lucide-icons/scout-context.md`  
**Directory:** `/Users/danielcarter/Documents/Dev/projects/sero/sero`

## Overview

This initiative should remove repo-authored emoji iconography from in-scope Sero UI surfaces and normalize recurring icon semantics around Lucide.

The repo is already mostly Lucide-first. The work is therefore not a redesign and not a new abstraction project; it is a **targeted normalization pass** across the remaining hotspots in:

- `apps/desktop/src/components/**`
- `packages/ui/src/components/**`
- `plugins/sero-*-plugin/ui/**`

The safest implementation shape is:

1. define one canonical icon vocabulary for the recurring concepts in the spec,
2. migrate by **folder/file clusters** so multiple workers can run concurrently,
3. avoid a monorepo-wide icon registry unless duplication is both repeated and load-bearing,
4. finish with a repo-wide in-scope search sweep plus monorepo `pnpm typecheck`.

## Investigation Summary

Relevant codebase facts:

- `lucide-react` is already the dominant icon system in desktop, shared UI, and plugin surfaces.
- `packages/ui/src/components/ui/button.tsx` already handles icon/text spacing and SVG sizing well, so most button migrations are straightforward icon swaps.
- The clearest low-risk first cluster is the admin editor trio:
  - `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx`
  - `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx`
  - `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`
- Strong in-repo references already exist for the desired semantics:
  - `apps/desktop/src/components/layout/context-editor/PresetBar.tsx` → `Save`, `Trash2`, `RotateCcw`
  - `apps/desktop/src/components/layout/shell/StatusBar.tsx` → `Palette`, `Sun`, `Moon`, `Monitor`
  - `packages/ui/src/components/model-selection/available-model-picker.tsx` → `Sparkles`, `Check`, `X`
  - `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx` → `RefreshCw`, `Trash2`, `Loader2`
- The duplicated tool icon map is isolated to two desktop files:
  - `apps/desktop/src/components/apps/explorer/orchestration/SubagentCard.tsx`
  - `apps/desktop/src/components/layout/CollaborationLiveActivity.tsx`
- `packages/ui/src/components/ai-elements/voice-selector.tsx` is already **525 LOC**, so any change there must also bring it back under the repo’s 500 LOC limit.

## Recommended Approach

Use a **folder-scoped migration plan with a canonical decision table**, not a new shared registry.

### Why this approach

- It minimizes git conflicts by assigning workers to mostly disjoint files/folders.
- It keeps the work semantic: workers normalize concepts, not just literal glyphs.
- It avoids adding a speculative abstraction layer for icons that are mostly consumed once per file.
- It still allows one small local helper when duplication is extremely tight, but only inside a single worker-owned cluster.

### Key Decisions

- **No monorepo-wide icon registry.** The scope is too small and too UI-local to justify a new shared system.
- **Do not chase every non-ASCII glyph in the repo.** Focus on repo-authored UI emoji and emoji-adjacent icon markers that function as actions/statuses in the touched surfaces.
- **Leave non-icon punctuation alone** unless it is part of the same semantic cleanup:
  - keep keyboard shortcut glyphs like `⌘`
  - keep comments/docs/examples
  - keep user/external content
  - do not sweep generic disclosure glyphs everywhere just because they are non-ASCII
- **Tool/action maps are in scope.** The duplicated desktop tool maps should become Lucide-based.
- **Theme/appearance controls must align to existing desktop semantics**:
  - browse themes → `Palette`
  - edit theme → `Pencil`
  - light/dark/system → `Sun` / `Moon` / `Monitor`
- **Voice accent flags in shared UI get one generic Lucide treatment**: use `Languages` as the planner-approved replacement because Lucide does not provide a country-flag family. Accent-specific meaning should come from adjacent text or `children`, not the icon.
- **If a touched file crosses or already exceeds 500 LOC, split it immediately.** `voice-selector.tsx` is the only known must-split case up front.

## Non-Goals / Scope Guards

- Do not modify docs, scripts, tests, fixtures, logs, prompts, or config text.
- Do not rewrite emoji inside user-authored or external content.
- Do not redesign layouts beyond icon alignment/spacing fixes needed for legibility.
- Do not build a generalized “icon DSL”, registry package, or cross-repo helper library.
- Do not change data flow/store/IPC contracts for any surface in this pass.

## Canonical Icon Decision Table

| Concept | Canonical Lucide icon | Decision notes |
| --- | --- | --- |
| delete / remove / uninstall | `Trash2` | Matches existing dominant repo usage. |
| save / persist | `Save` | Use in text buttons where semantics are save/persist. |
| add / create / new | `Plus` | Use `PlusCircle` only for intentionally prominent create affordances; default to `Plus` in dense UI. |
| edit / rename / custom answer | `Pencil` | Use for edit affordances and “Type something” style custom-entry affordances. |
| close / dismiss / clear | `X` | Use for dismiss/clear/close, not error status. |
| search / find / grep / glob | `Search` | One canonical search-family choice for UI labels and tool maps. |
| refresh / reload / rescan | `RefreshCw` | Use for refresh and auto-refresh; do not use `RotateCcw` unless meaning is reset/retry/undo. |
| reset / undo / restore | `RotateCcw` | Keep distinct from refresh. |
| loading / in progress | `Loader2` | Keep existing spinner pattern. |
| warning / caution / sensitive data | `TriangleAlert` | Planner choice for warning-family standard. Keep `AlertCircle` only for softer advisory states already intentionally distinct. |
| success / completed status | `CheckCircle2` | Use for status chips/badges and prominent complete states. |
| selected / confirmed inline state | `Check` | Use in pickers, checklines, compact confirmation labels, and inline “Done” actions. |
| error / failed status | `XCircle` | Use for actual status/failure, not close buttons. |
| theme / browse appearance | `Palette` | Theme browsing / theme library semantics. |
| edit current theme | `Pencil` | Same edit-family semantic as other edit actions. |
| theme mode: light / dark / system | `Sun` / `Moon` / `Monitor` | Mirrors existing `StatusBar.tsx`. |
| one-time / time / scheduled at | `Clock3` | Planner choice for clock-family standard in cron/reminder UI. |
| recurring / repeat | `RefreshCw` | Reuse repo’s existing refresh/repeat family rather than introducing `Repeat` drift. |
| notification / reminder | `Bell` | Reminder count, active reminder badge, notification settings entrypoint. |
| notifications muted / sound off | `BellOff` | Use when the meaning is bell/notification disabled. |
| desktop notification destination | `Monitor` | Use when the meaning is explicitly “desktop notification”. |
| start / run / enable | `Play` | For start/run/enable controls. |
| pause / disable / snooze-like hold | `Pause` | For pause/disable/snooze states when semantics are temporary stop/hold. |
| reasoning / premium capability marker | `Sparkles` | Matches existing available-model picker convention. |
| settings / use default / configure | `Settings2` | Use when the current glyph is a gear/config meaning, not system theme mode. |
| tool map: read | `FileText` | Compact file-reading semantic. |
| tool map: bash / shell | `Terminal` | Use for shell execution. |
| tool map: write / edit | `Pencil` | One canonical edit/write family. |
| tool map: ls / folder browse | `FolderOpen` | Folder listing/browse semantic. |
| tool map: unknown tool | `Wrench` | Generic tool fallback. |
| voice accent / locale marker | `Languages` | Planner decision for shared UI because there is no Lucide flag family; rely on text for the specific locale. |

## Architecture / Implementation Notes

### 1. Migrate in place with direct Lucide imports

For most files, the right implementation is simply:

- import the needed icon(s) from `lucide-react`
- replace the emoji-leading label with `<Icon className="..." />` + existing text
- keep current button variants, text, colors, and handlers

This repo already has good references for the exact markup shape.

### 2. Avoid shared abstraction unless duplication is unavoidable inside one cluster

Two places look tempting for helpers:

- desktop tool icon maps
- theme/appearance icon selections

The recommendation is still **not** to create a reusable cross-repo registry.

- For the theme surfaces, the duplication is tiny; keep it file-local.
- For the desktop tool maps, either:
  - keep both files in one worker cluster and duplicate the small Lucide map intentionally, or
  - extract one tiny helper only inside that cluster if the worker judges it cleaner.

Do **not** introduce a new package/shared registry just for this initiative.

### 3. Preserve density and accessibility

- Buttons should continue to rely on `@sero-ai/ui` `Button` spacing behavior.
- Dense rows should generally use `size-3` or `size-3.5` icons.
- Empty-state icons can use `size-5` or similar scale.
- If the icon becomes icon-only, add `title` / `aria-label` where needed.
- Preserve existing visible text labels whenever possible; this is a consistency pass, not a copy rewrite.

### 4. Treat voice-selector as a special case

`packages/ui/src/components/ai-elements/voice-selector.tsx` is already over the max file size. Any work there must:

1. split the accent rendering into a new file/module first,
2. preserve exports/public API shape,
3. replace flag emoji with the canonical `Languages` treatment.

## Concurrent Todo Groups

### Summary table

| ID | Scope | Primary files | Can run in parallel with |
| --- | --- | --- | --- |
| TG-01 | Admin editor actions | `SkillEditor.tsx`, `PromptEditor.tsx`, `AgentEditor.tsx` | TG-02–TG-09 |
| TG-02 | Admin supporting controls | `ConfigPanel.tsx`, `ResourceSection.tsx`, `SessionList.tsx`, `SessionDetail.tsx`, `LogViewer.tsx` | TG-01, TG-03–TG-09 |
| TG-03 | Desktop shell/theme controls | `CommandMenu.tsx`, `ModeToggle.tsx` | TG-01–TG-02, TG-04–TG-09 |
| TG-04 | Desktop orchestration tool maps | `SubagentCard.tsx`, `CollaborationLiveActivity.tsx` | TG-01–TG-03, TG-05–TG-09 |
| TG-05 | Desktop explorer/workspace icon cleanup | `EditorPanel.tsx`, `ChangeLogRow.tsx`, `WorkspaceNode.tsx`, `PendingQuestionCard.tsx` | TG-01–TG-04, TG-06–TG-09 |
| TG-06 | Cron reminders/scheduler core | `ReminderForm.tsx`, `ReminderCard.tsx`, `ReminderList.tsx`, `SchedulerBar.tsx`, `NotificationSettings.tsx` | TG-01–TG-05, TG-07–TG-09 |
| TG-07 | Cron jobs/header/model picker | `CronAppHeader.tsx`, `JobsTab.tsx`, `JobCard.tsx`, `JobForm.tsx`, `ModelPicker.tsx` | TG-01–TG-06, TG-08–TG-09 |
| TG-08 | User-feedback questionnaires | `QuestionnaireForm.tsx`, `InterviewForm.tsx`, `QuestionnaireQuestionStep.tsx` | TG-01–TG-07, TG-09 |
| TG-09 | Shared UI voice selector | `voice-selector.tsx` + extracted accent module | TG-01–TG-08 |
| TG-10 | Final sweep / validation / reconciliation | in-scope folders only | after TG-01–TG-09 |

### TG-01 — Admin editor action normalization

**Files**
- `plugins/sero-admin-plugin/ui/components/SkillEditor.tsx`
- `plugins/sero-admin-plugin/ui/components/PromptEditor.tsx`
- `plugins/sero-admin-plugin/ui/components/AgentEditor.tsx`

**Changes**
- Replace `🗑 Delete` with `Trash2 + Delete`.
- Replace `💾 Save` with `Save + Save` when not saving.
- Preserve the plain `Saving…` loading copy while disabled.

**Constraints**
- Do not create a shared admin icon helper.
- Keep current button variants/classes and destructive coloring.
- Preserve existing save/delete enablement logic.

**Reference patterns**
- `apps/desktop/src/components/layout/context-editor/PresetBar.tsx`
- `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx`

**Acceptance targets**
- ISC-3, ISC-4, ISC-5, ISC-13

### TG-02 — Admin supporting controls

**Files**
- `plugins/sero-admin-plugin/ui/components/ConfigPanel.tsx`
- `plugins/sero-admin-plugin/ui/components/ResourceSection.tsx`
- `plugins/sero-admin-plugin/ui/components/SessionList.tsx`
- `plugins/sero-admin-plugin/ui/components/SessionDetail.tsx`
- `plugins/sero-admin-plugin/ui/components/LogViewer.tsx`

**Changes**
- `⚠ Contains sensitive data` → `TriangleAlert + text`.
- `↻` refresh affordances → `RefreshCw`.
- `+ New …` actions in `ResourceSection` → `Plus + label`.
- `✕` close button in `SessionDetail` → `X`.
- Auto-refresh bullet indicators in `LogViewer` → refresh-family Lucide treatment, preferably `RefreshCw` with existing text.

**Constraints**
- Do not alter CRUD/session loading behavior.
- Keep dense toolbar sizing (`h-5`, `h-6`, `size="sm"`, etc.).
- Avoid broad admin folder sweeps outside the listed files.

**Reference patterns**
- `plugins/sero-admin-plugin/ui/components/plugins/PluginDevSessionCard.tsx` for `RefreshCw`
- `packages/ui/src/components/model-selection/available-model-picker.tsx` for compact `X`

**Acceptance targets**
- ISC-3, ISC-7, ISC-10, ISC-11, ISC-13

### TG-03 — Desktop shell/theme controls

**Files**
- `apps/desktop/src/components/layout/shell/CommandMenu.tsx`
- `apps/desktop/src/components/layout/theme/theme-panel/ModeToggle.tsx`

**Changes**
- `🎨 Browse Themes` → `Palette + Browse Themes`.
- `✏️ Edit Current Theme` → `Pencil + Edit Current Theme`.
- `◑ Toggle Light / Dark / System` → one Lucide appearance icon; planner preference is `Monitor` for the command item.
- Mode toggle options:
  - Light → `Sun`
  - Dark → `Moon`
  - System → `Monitor`

**Constraints**
- Match the visual semantics already used in `StatusBar.tsx`.
- Keep existing keyboard/open behavior unchanged.
- Do not add a shared theme icon registry.

**Reference patterns**
- `apps/desktop/src/components/layout/shell/StatusBar.tsx`

**Acceptance targets**
- ISC-1, ISC-8, ISC-13

### TG-04 — Desktop orchestration tool maps

**Files**
- `apps/desktop/src/components/apps/explorer/orchestration/SubagentCard.tsx`
- `apps/desktop/src/components/layout/CollaborationLiveActivity.tsx`

**Changes**
- Replace emoji tool maps with the canonical Lucide mapping:
  - read → `FileText`
  - bash → `Terminal`
  - write/edit → `Pencil`
  - ls → `FolderOpen`
  - find/grep/glob → `Search`
  - unknown → `Wrench`

**Constraints**
- Keep both files in the same worker cluster to prevent drift.
- Do not change subagent store/IPC types or activity feed behavior.
- Preserve compact row density.
- If a helper is introduced, keep it local to this cluster only.

**Reference patterns**
- `apps/desktop/src/components/layout/collaboration-visuals.tsx` for a `LucideIcon` mapping style

**Acceptance targets**
- ISC-1, ISC-9, ISC-13

### TG-05 — Desktop explorer/workspace dense status and empty states

**Files**
- `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx`
- `apps/desktop/src/components/apps/explorer/vcs/ChangeLogRow.tsx`
- `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`
- `apps/desktop/src/components/layout/PendingQuestionCard.tsx`

**Changes**
- `📝 No file open` empty state → a document/code Lucide icon; planner preference is `FileCode2` because the surface is editor-specific.
- `✕` clear-selection affordance in `WorkspaceNode` → `X`.
- `✎ Type something…` in `PendingQuestionCard` → `Pencil`.
- `ChangeLogRow` status glyphs should move to Lucide where semantics are status-like:
  - immutable → success icon (`CheckCircle2`)
  - conflict → failure icon (`XCircle`)
  - empty/default neutral → circle-family Lucide icon
- Keep the VCS working-copy `@` marker unchanged; it is domain notation, not emoji UI chrome.

**Constraints**
- Preserve row density in `ChangeLogRow`.
- Do not redesign VCS semantics or workspace selection logic.
- Limit edits to the listed files.

**Reference patterns**
- `apps/desktop/src/components/layout/CollaborationFeedItems.tsx` for compact status icons
- `packages/ui/src/components/model-selection/available-model-picker.tsx` for compact `X`
- `apps/desktop/src/components/layout/workspace/SessionNode.tsx` for `Pencil`

**Acceptance targets**
- ISC-1, ISC-10, ISC-11, ISC-13, ISC-14

### TG-06 — Cron reminders and scheduler core

**Files**
- `plugins/sero-cron-plugin/ui/components/ReminderForm.tsx`
- `plugins/sero-cron-plugin/ui/components/ReminderCard.tsx`
- `plugins/sero-cron-plugin/ui/components/ReminderList.tsx`
- `plugins/sero-cron-plugin/ui/components/SchedulerBar.tsx`
- `plugins/sero-cron-plugin/ui/components/NotificationSettings.tsx`

**Changes**
- Reminder type labels:
  - one-time → `Clock3`
  - recurring → `RefreshCw`
- Reminder/time/status labels:
  - active → `Bell`
  - done status → `CheckCircle2`
  - inline done action → `Check`
  - paused/snoozed/held states → `Pause`
  - legacy email badge → `Mail`
  - desktop notification destination → `Monitor`
- Scheduler bar:
  - reminder count → `Bell`
  - start/stop → `Play` / `Pause`
- Notification settings popover button:
  - sound enabled → `Bell`
  - sound disabled → `BellOff`

**Constraints**
- Preserve all reminder/job logic and labels.
- Keep `Badge`/`Button` density intact.
- Do not invent a separate cron-specific icon set that diverges from the canonical table.

**Reference patterns**
- `apps/desktop/src/components/layout/shell/StatusBar.tsx` for `Monitor`
- `packages/ui/src/components/model-selection/available-model-picker.tsx` for `Check` and `X`

**Acceptance targets**
- ISC-3, ISC-7, ISC-11, ISC-12, ISC-13

### TG-07 — Cron jobs, header, and model picker

**Files**
- `plugins/sero-cron-plugin/ui/components/CronAppHeader.tsx`
- `plugins/sero-cron-plugin/ui/components/JobsTab.tsx`
- `plugins/sero-cron-plugin/ui/components/JobCard.tsx`
- `plugins/sero-cron-plugin/ui/components/JobForm.tsx`
- `plugins/sero-cron-plugin/ui/components/ModelPicker.tsx`

**Changes**
- Empty/title/create surfaces:
  - scheduler title / jobs empty state → `Clock3`
  - `+ Reminder` / `+ Job` / `+ New Job` → `Plus`
- Job actions:
  - enable/run → `Play`
  - disable → `Pause`
- Cron validation success line → `Check`
- Model picker normalization:
  - reasoning marker `✦` → `Sparkles`
  - clear `✕` → `X`
  - default-model gear `⚙` → `Settings2`
  - selection checkmarks `✓` → `Check`
- Explicitly leave `RunHistory.tsx` disclosure chevrons for a later pass; they are not part of the emoji cleanup target.

**Constraints**
- Match `available-model-picker.tsx` closely for picker icon shape/spacing.
- Do not change search/filter/model resolution logic.
- Keep this group isolated from TG-06 by file boundary.

**Reference patterns**
- `packages/ui/src/components/model-selection/available-model-picker.tsx`

**Acceptance targets**
- ISC-3, ISC-10, ISC-11, ISC-12, ISC-13

### TG-08 — User-feedback questionnaire surfaces

**Files**
- `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx`
- `plugins/sero-user-feedback-plugin/ui/InterviewForm.tsx`
- `plugins/sero-user-feedback-plugin/ui/questionnaire/QuestionnaireQuestionStep.tsx`

**Changes**
- Step-complete `✓` markers → `Check`.
- `✎ Type something…` → `Pencil`.
- Preserve the numbered fallback when a step/option is not yet selected.

**Constraints**
- Do not change questionnaire data structures or answer flattening behavior.
- Keep current button/card layout intact.
- Use compact icon sizing so list rhythm does not change.

**Reference patterns**
- `packages/ui/src/components/model-selection/available-model-picker.tsx` for `Check`
- `apps/desktop/src/components/layout/workspace/SessionNode.tsx` for `Pencil`

**Acceptance targets**
- ISC-3, ISC-10, ISC-11, ISC-13

### TG-09 — Shared UI voice selector accent cleanup

**Files**
- `packages/ui/src/components/ai-elements/voice-selector.tsx`
- new extracted module(s), e.g. `packages/ui/src/components/ai-elements/voice-selector-accent.tsx`

**Changes**
- First split accent rendering out of the 525 LOC file to bring all touched files under 500 LOC.
- Replace flag emoji mapping with a Lucide-based implementation.
- Planner decision: the default accent icon becomes `Languages` for all accents.
- Preserve `children ?? icon` behavior so callers can still override presentation if needed.

**Constraints**
- Preserve the public export surface.
- Do not add a custom SVG/flag asset pack.
- Do not try to emulate flags with ad hoc CSS shapes.
- Keep the generic accent icon decision intentional and documented in code comments if helpful.

**Reference patterns**
- `packages/ui/src/components/ai-elements/voice-selector.tsx` existing `VoiceSelectorGender` icon pattern
- `apps/desktop/src/components/layout/collaboration-visuals.tsx` for a typed `LucideIcon` mapping style

**Acceptance targets**
- ISC-2, ISC-12, ISC-13, ISC-A-3

### TG-10 — Final validation and reconciliation sweep

**Files**
- In-scope UI folders only; no out-of-scope cleanup.

**Changes**
- Run targeted searches for remaining emoji/icon-glyph hotspots.
- Fix any leftovers using the canonical table rather than ad hoc choices.
- Run root `pnpm typecheck`.
- Check touched file line counts, especially any extracted/shared UI files.

**Constraints**
- Do not expand into docs/tests/scripts.
- Do not “fix” unrelated copy/layout issues discovered during the sweep.
- Resolve conflicts in favor of the canonical table in this plan.

**Acceptance targets**
- ISC-1, ISC-2, ISC-3, ISC-9, ISC-10, ISC-A-1, ISC-A-2, ISC-A-3

## Sequencing

Recommended execution order:

1. **Start in parallel:** TG-01 through TG-09.
2. **Finish last:** TG-10 after the cluster PRs/branches are merged or rebased together.

There are intentionally **no global-blocker prerequisites** before the surface migrations begin.

The only notable sequencing caveat is TG-09:

- the worker must split `voice-selector.tsx` before or while replacing its flag emoji,
- because the file is already above the repo’s file-size limit.

## Validation Strategy

### Targeted searches

Run these searches during TG-10 and optionally within each cluster before handoff:

```bash
rg -n '(🗑|💾|⚠|🕐|🔄|✅|🎨|✏️|◑|⏰|🔔|💤|📧|▶|⏸|🖥|✦|✕|✓|☀|☾|⚙|📖|📂|📁|🔍|🔎|🔧|📝|↻|✎|◆|✖)' \
  apps/desktop/src/components \
  packages/ui/src/components \
  plugins/sero-*-plugin/ui

rg -n '🇺🇸|🇬🇧|🇦🇺|🇨🇦|🇮🇪|🏴|🇮🇳|🇿🇦|🇳🇿|🇪🇸|🇫🇷|🇩🇪|🇮🇹|🇵🇹|🇧🇷|🇲🇽|🇦🇷|🇯🇵|🇨🇳|🇰🇷|🇷🇺|🇸🇦|🇳🇱|🇸🇪|🇳🇴|🇩🇰|🇫🇮|🇵🇱|🇹🇷|🇬🇷' \
  packages/ui/src/components/ai-elements/voice-selector.tsx
```

Interpretation notes:

- ignore comments/examples/docs if a search pattern catches them accidentally,
- ignore keyboard shortcut glyphs and domain notation intentionally excluded above,
- only repo-authored UI chrome in the in-scope folders counts.

### Type safety

From repo root:

```bash
pnpm typecheck
```

### File-size check

For any touched file near the limit:

```bash
wc -l <file>
```

### Manual smoke review

Manually review at least one representative surface from each cluster:

- admin editors
- admin config/session/log tools
- command palette + theme mode toggle
- subagent card + collaboration live activity
- explorer empty state + VCS change log
- cron reminders/jobs/model picker
- user-feedback questionnaire
- any consumer/story/example available for shared `voice-selector`

## Risks & Accepted Premortem

| Risk / assumption | If wrong | Mitigation / decision |
| --- | --- | --- |
| The remaining scope is mostly isolated to the inventoried files | A final sweep could still find uncatalogued emoji in in-scope UI | TG-10 targeted search + reconciliation pass |
| Replacing emoji with Lucide will fit dense layouts without redesign | Dense rows/buttons could misalign or wrap | Use existing `Button` spacing and existing `size-3` / `size-3.5` patterns; keep changes local |
| Voice selector can tolerate a generic accent icon | If a consumer relied on flag distinction alone, semantics get weaker | Preserve `children` override; rely on adjacent text; document the planner decision |
| Workers might drift on ambiguous icon families | Different surfaces could choose different icons for the same concept | Canonical table is the source of truth; TG-10 reconciles drift |
| Broad unicode searches may tempt workers into scope creep | Time gets lost cleaning comments, tests, or non-UI glyphs | Explicit scope guards and file lists per todo group |

Accepted risks for this plan:

- We are intentionally **not** standardizing every punctuation/disclosure glyph in the repo.
- We are intentionally choosing a **generic** accent icon in shared UI instead of inventing pseudo-flag replacements.
- We are intentionally avoiding a cross-repo icon registry even though a couple of local maps remain duplicated; concurrency and simplicity matter more here.

## Dependencies

- No new libraries.
- Use existing `lucide-react` already present in the monorepo.

## Worker Notes

- Prefer direct Lucide imports in each touched file.
- Keep imports top-level; no inline dynamic icon imports.
- Preserve existing comments unless they become misleading.
- Check file size before marking the work complete.
- Avoid touching the same files across multiple worker branches; the todo groups above are the assignment boundary.
